import logging
from pathlib import Path
from uuid import uuid4

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .activity import control_label, record_activity
from .config import settings
from .database import engine, get_db
from .migrate import upgrade_database
from .evidence_text import (
    IMAGE_FORMATS,
    ExtractionResult,
    InvalidImageError,
    extract_evidence_text,
    validate_image,
)
from .ocr import ocr_available
from .search import parse_terms, search_evidence
from .ai_assessment import AIServiceError, analyze_control_evidence
from .auth import (
    authenticate,
    create_session,
    get_current_token,
    hash_password,
    login_throttle,
    require_admin,
    require_editor,
    require_user,
    revoke_other_sessions,
    revoke_session,
    too_many_attempts,
    verify_password,
)
from . import models, schemas


logger = logging.getLogger("securelens")


# ---------------------------------------------------------
# FILE STORAGE CONFIGURATION
# ---------------------------------------------------------

UPLOAD_DIR = (
    Path(__file__).resolve().parent.parent
    / "uploads"
)

UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

MAX_EVIDENCE_SIZE = 10 * 1024 * 1024

ALLOWED_FILE_TYPES = {
    ".pdf": {
        "application/pdf",
        "application/octet-stream",
    },
    ".txt": {
        "text/plain",
        "application/octet-stream",
    },
    # Images are also checked by content (validate_image) and served
    # with the type found in the file, not the one the browser sent.
    ".png": {
        "image/png",
        "application/octet-stream",
    },
    ".jpg": {
        "image/jpeg",
        "image/pjpeg",
        "application/octet-stream",
    },
    ".jpeg": {
        "image/jpeg",
        "image/pjpeg",
        "application/octet-stream",
    },
}


# ---------------------------------------------------------
# APP
# ---------------------------------------------------------

app = FastAPI(
    title="SecureLens API",
    description=(
        "Backend API for the SecureLens "
        "security assessment platform."
    ),
    version="1.0.0",
)


# Apply pending schema migrations (see backend/migrations). Set
# AUTO_MIGRATE=false to run `alembic upgrade head` yourself instead,
# for example when several server processes start at once.
if settings.auto_migrate:
    upgrade_database(engine)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# HELPERS
# ---------------------------------------------------------

def get_system_or_404(
    db: Session,
    system_id: int,
):
    system = db.get(
        models.System,
        system_id,
    )

    if system is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System not found",
        )

    return system


def get_control_or_404(
    db: Session,
    system_id: int,
    control_code: str,
):
    statement = (
        select(models.SystemControl)
        .options(
            selectinload(
                models.SystemControl.evidence
            )
        )
        .where(
            models.SystemControl.system_id
            == system_id,
            models.SystemControl.code
            == control_code,
        )
    )

    control = db.scalar(statement)

    if control is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Control not found",
        )

    return control


def delete_physical_file(
    stored_filename: str,
):
    file_path = (
        UPLOAD_DIR
        / stored_filename
    )

    if file_path.exists():
        file_path.unlink()


def recalculate_system(
    db: Session,
    system: models.System,
):
    statement = (
        select(models.SystemControl)
        .where(
            models.SystemControl.system_id
            == system.id
        )
        .order_by(
            models.SystemControl.id
        )
    )

    controls = db.scalars(
        statement
    ).all()

    total_controls = len(controls)

    assessed_controls = [
        control
        for control in controls
        if control.status
        != "Not Assessed"
    ]

    assessed_count = len(
        assessed_controls
    )

    if total_controls == 0:
        progress = 0
    else:
        progress = round(
            (
                assessed_count
                / total_controls
            )
            * 100
        )

    if total_controls == 0:
        system.status = "Not Started"

    elif assessed_count == 0:
        system.status = "Not Started"

    elif assessed_count < total_controls:
        system.status = "In Progress"

    else:
        system.status = "Completed"

    has_not_met = any(
        control.status == "Not Met"
        for control in controls
    )

    has_partial = any(
        control.status == "Partially Met"
        for control in controls
    )

    if has_not_met:
        system.risk = "High"

    elif has_partial:
        system.risk = "Medium"

    elif assessed_count > 0:
        system.risk = "Low"

    else:
        system.risk = "Not Assessed"

    system.progress = progress

    db.add(system)
    db.commit()
    db.refresh(system)


# ---------------------------------------------------------
# ROOT / HEALTH
# ---------------------------------------------------------

@app.get("/")
def root():
    return {
        "name": "SecureLens API",
        "status": "running",
    }


@app.get(
    "/health",
    response_model=schemas.HealthResponse,
)
def health_check():
    # Reports only whether a key is configured, never the key itself.
    return {
        "status": "healthy",
        "service": "SecureLens API",
        "aiConfigured": bool(settings.openai_api_key),
        "aiModel": settings.openai_model,
        "ocrAvailable": ocr_available(),
    }


# ---------------------------------------------------------
# AUTHENTICATION
# ---------------------------------------------------------

def client_address(http_request: Request) -> str:
    # Behind a reverse proxy this is the proxy's address; run uvicorn
    # with --proxy-headers so the real client address is used.
    return http_request.client.host if http_request.client else "unknown"


def count_users(db: Session) -> int:
    return db.scalar(
        select(func.count()).select_from(models.User)
    )


def login_response(db: Session, user: models.User):
    token, expires_at = create_session(db, user)

    return {
        "token": token,
        "expiresAt": expires_at,
        "user": user,
    }


@app.get(
    "/auth/status",
    response_model=schemas.AuthStatusResponse,
)
def auth_status(
    db: Session = Depends(get_db),
):
    return {
        "setupRequired": count_users(db) == 0,
    }


@app.post(
    "/auth/setup",
    response_model=schemas.LoginResponse,
    status_code=status.HTTP_201_CREATED,
)
def setup_first_admin(
    request: schemas.SetupRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    # Only allowed while the database has no users at all.
    if count_users(db) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Setup is already complete. Sign in instead.",
        )

    user = models.User(
        username=request.username,
        password_hash=hash_password(request.password),
        role="admin",
    )

    db.add(user)
    db.flush()
    record_activity(
        db, user, "auth.setup",
        f"Created the first admin account {user.username}",
        client=client_address(http_request),
    )
    db.commit()
    db.refresh(user)

    return login_response(db, user)


@app.post(
    "/auth/login",
    response_model=schemas.LoginResponse,
)
def login(
    request: schemas.LoginRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    username = request.username.strip()
    client = client_address(http_request)

    # Checked before the password so a blocked guesser learns nothing.
    wait = login_throttle.retry_after(client, username)
    if wait:
        raise too_many_attempts(wait)

    user = authenticate(db, username, request.password)

    if user is None:
        login_throttle.record_failure(client, username)
        record_activity(
            db, None, "auth.login_failed",
            f"Failed sign-in for username \"{username[:80]}\"",
            actor_name=username,
            client=client,
        )
        db.commit()
        # Same message for unknown users and wrong passwords.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
        )

    login_throttle.record_success(client, username)
    record_activity(db, user, "auth.login", "Signed in", client=client)
    return login_response(db, user)


@app.post(
    "/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
def logout(
    token: str = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    revoke_session(db, token)
    return None


@app.get(
    "/auth/me",
    response_model=schemas.UserResponse,
)
def current_user_profile(
    current_user: models.User = Depends(require_user),
):
    return current_user


@app.post(
    "/auth/password",
    status_code=status.HTTP_204_NO_CONTENT,
)
def change_own_password(
    request: schemas.PasswordChange,
    http_request: Request,
    token: str = Depends(get_current_token),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    client = client_address(http_request)

    # A stolen session must not be usable to guess the password.
    wait = login_throttle.retry_after(client, current_user.username)
    if wait:
        raise too_many_attempts(wait)

    if not verify_password(request.currentPassword, current_user.password_hash):
        login_throttle.record_failure(client, current_user.username)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is incorrect.",
        )

    if request.newPassword == request.currentPassword:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a new password that differs from the current one.",
        )

    current_user.password_hash = hash_password(request.newPassword)
    # Keep this browser signed in; sign out everywhere else.
    revoke_other_sessions(db, current_user, token)
    record_activity(
        db, current_user, "auth.password_change",
        "Changed their own password", client=client,
    )
    db.commit()

    login_throttle.record_success(client, current_user.username)
    return None


# ---------------------------------------------------------
# USERS (ADMIN)
# ---------------------------------------------------------

def get_user_or_404(db: Session, user_id: int):
    user = db.get(models.User, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


def ensure_another_admin(db: Session, user: models.User):
    if user.role != "admin":
        return

    admins = db.scalar(
        select(func.count())
        .select_from(models.User)
        .where(models.User.role == "admin")
    )

    if admins <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="SecureLens must keep at least one admin.",
        )


@app.get(
    "/users",
    response_model=list[schemas.UserResponse],
)
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    return db.scalars(
        select(models.User).order_by(models.User.id)
    ).all()


@app.post(
    "/users",
    response_model=schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    request: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    exists = db.scalar(
        select(models.User).where(
            models.User.username == request.username
        )
    )

    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username is already taken.",
        )

    user = models.User(
        username=request.username,
        password_hash=hash_password(request.password),
        role=request.role,
    )

    db.add(user)
    record_activity(
        db, current_user, "user.create",
        f"Created user {request.username} ({request.role})",
    )
    db.commit()
    db.refresh(user)

    return user


@app.put(
    "/users/{user_id}",
    response_model=schemas.UserResponse,
)
def update_user(
    user_id: int,
    request: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    user = get_user_or_404(db, user_id)

    if request.role is not None and request.role != user.role:
        ensure_another_admin(db, user)
        record_activity(
            db, current_user, "user.update",
            f"Changed {user.username}'s role from {user.role} to {request.role}",
        )
        user.role = request.role

    if request.password is not None:
        user.password_hash = hash_password(request.password)
        record_activity(
            db, current_user, "user.update",
            f"Reset the password for {user.username}",
        )
        # A password reset signs the user out everywhere.
        user.sessions.clear()

    db.commit()
    db.refresh(user)

    return user


@app.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    user = get_user_or_404(db, user_id)

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot delete your own account.",
        )

    ensure_another_admin(db, user)

    record_activity(
        db, current_user, "user.delete",
        f"Deleted user {user.username} ({user.role})",
    )
    db.delete(user)
    db.commit()

    return None


# ---------------------------------------------------------
# ACTIVITY LOG (ADMIN)
# ---------------------------------------------------------

@app.get(
    "/activity",
    response_model=list[schemas.ActivityEventResponse],
)
def list_activity(
    limit: int = Query(50, ge=1, le=200),
    before: int | None = Query(None, ge=1),
    category: str | None = Query(None, max_length=20, pattern=r"^[a-z]+$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Newest first. Pass the last id you received as `before` for more."""
    statement = select(models.ActivityEvent)

    if before is not None:
        statement = statement.where(models.ActivityEvent.id < before)

    if category:
        statement = statement.where(
            models.ActivityEvent.action.startswith(category + ".")
        )

    return db.scalars(
        statement.order_by(models.ActivityEvent.id.desc()).limit(limit)
    ).all()


# ---------------------------------------------------------
# SYSTEMS
# ---------------------------------------------------------

@app.post(
    "/systems",
    response_model=schemas.SystemResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_system(
    system: schemas.SystemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    new_system = models.System(
        name=system.name,
        owner=system.owner,
        environment=system.environment,
        description=system.description,
        status="Not Started",
        progress=0,
        risk="Not Assessed",
    )

    db.add(new_system)
    record_activity(
        db, current_user, "system.create",
        f"Created system \"{new_system.name}\"",
    )
    db.commit()
    db.refresh(new_system)

    return new_system


@app.get(
    "/systems",
    response_model=list[
        schemas.SystemResponse
    ],
)
def get_systems(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    statement = (
        select(models.System)
        .options(
            selectinload(
                models.System.controls
            ).selectinload(
                models.SystemControl.evidence
            )
        )
        .order_by(
            models.System.id
        )
    )

    return db.scalars(
        statement
    ).all()


@app.get(
    "/systems/{system_id}",
    response_model=schemas.SystemResponse,
)
def get_system(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    return load_system_with_controls(db, system_id)


def load_system_with_controls(
    db: Session,
    system_id: int,
):
    statement = (
        select(models.System)
        .options(
            selectinload(
                models.System.controls
            ).selectinload(
                models.SystemControl.evidence
            )
        )
        .where(
            models.System.id
            == system_id
        )
    )

    system = db.scalar(statement)

    if system is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System not found",
        )

    return system


@app.put(
    "/systems/{system_id}",
    response_model=schemas.SystemResponse,
)
def update_system(
    system_id: int,
    update: schemas.SystemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    system = get_system_or_404(
        db,
        system_id,
    )

    changes = update.model_dump(
        exclude_unset=True,
    )

    for field in ("name", "owner", "environment"):
        if changes.get(field) is None:
            changes.pop(field, None)

    if changes:
        record_activity(
            db, current_user, "system.update",
            f"Updated system \"{system.name}\" ({', '.join(sorted(changes))})",
        )

    for field, value in changes.items():
        setattr(system, field, value)

    db.add(system)
    db.commit()

    return load_system_with_controls(db, system_id)


@app.delete(
    "/systems/{system_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_system(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    statement = (
        select(models.System)
        .options(
            selectinload(
                models.System.controls
            ).selectinload(
                models.SystemControl.evidence
            )
        )
        .where(
            models.System.id
            == system_id
        )
    )

    system = db.scalar(statement)

    if system is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System not found",
        )

    for control in system.controls:
        for evidence in control.evidence:
            delete_physical_file(
                evidence.stored_filename
            )

    record_activity(
        db, current_user, "system.delete",
        f"Deleted system \"{system.name}\" and its "
        f"{len(system.controls)} control(s)",
    )
    db.delete(system)
    db.commit()

    return None


# ---------------------------------------------------------
# CONTROLS
# ---------------------------------------------------------

@app.post(
    "/systems/{system_id}/controls",
    response_model=list[
        schemas.ControlResponse
    ],
    status_code=status.HTTP_201_CREATED,
)
def add_controls(
    system_id: int,
    controls: list[
        schemas.ControlCreate
    ],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    system = get_system_or_404(
        db,
        system_id,
    )

    existing_statement = (
        select(
            models.SystemControl.code
        )
        .where(
            models.SystemControl.system_id
            == system_id
        )
    )

    existing_codes = set(
        db.scalars(
            existing_statement
        ).all()
    )

    created_controls = []

    for control in controls:
        if control.code in existing_codes:
            continue

        new_control = models.SystemControl(
            system_id=system_id,
            code=control.code,
            name=control.name,
            family=control.family,
            description=control.description,
            status="Not Assessed",
            analyst_notes="",
            findings="",
        )

        db.add(new_control)

        created_controls.append(
            new_control
        )

        existing_codes.add(
            control.code
        )

    if created_controls:
        record_activity(
            db, current_user, "control.add",
            f"Added {', '.join(c.code for c in created_controls)} "
            f"to \"{system.name}\"",
        )

    db.commit()

    for control in created_controls:
        db.refresh(control)

    recalculate_system(
        db,
        system,
    )

    return created_controls


@app.get(
    "/systems/{system_id}/controls",
    response_model=list[
        schemas.ControlResponse
    ],
)
def get_controls(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    get_system_or_404(
        db,
        system_id,
    )

    statement = (
        select(models.SystemControl)
        .options(
            selectinload(
                models.SystemControl.evidence
            )
        )
        .where(
            models.SystemControl.system_id
            == system_id
        )
        .order_by(
            models.SystemControl.id
        )
    )

    return db.scalars(
        statement
    ).all()


@app.put(
    "/systems/{system_id}/controls/{control_code}",
    response_model=schemas.ControlResponse,
)
def update_control_assessment(
    system_id: int,
    control_code: str,
    update: schemas.ControlUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    system = get_system_or_404(
        db,
        system_id,
    )

    control = get_control_or_404(
        db,
        system_id,
        control_code,
    )

    previous = (
        control.status,
        control.analyst_notes,
        control.findings,
    )

    if update.status is not None:
        control.status = update.status

    if update.analystNotes is not None:
        control.analyst_notes = (
            update.analystNotes
        )

    if update.findings is not None:
        control.findings = (
            update.findings
        )

    # Record each saved change so decisions remain auditable.
    if previous != (
        control.status,
        control.analyst_notes,
        control.findings,
    ):
        db.add(
            models.AssessmentHistory(
                system_control_id=control.id,
                previous_status=previous[0],
                new_status=control.status,
                analyst_notes=control.analyst_notes,
                findings=control.findings,
                changed_by_id=current_user.id,
                changed_by=current_user.username,
            )
        )

        if previous[0] != control.status:
            change = f"{previous[0]} → {control.status}"
        else:
            change = "updated notes or findings"

        record_activity(
            db, current_user, "control.assess",
            f"Saved {control_label(system, control)}: {change}",
        )

    db.add(control)
    db.commit()
    db.refresh(control)

    recalculate_system(
        db,
        system,
    )

    return control


@app.get(
    "/systems/{system_id}/controls/{control_code}/history",
    response_model=list[
        schemas.AssessmentHistoryResponse
    ],
)
def get_control_history(
    system_id: int,
    control_code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    control = get_control_or_404(
        db,
        system_id,
        control_code,
    )

    statement = (
        select(models.AssessmentHistory)
        .where(
            models.AssessmentHistory.system_control_id
            == control.id
        )
        .order_by(
            models.AssessmentHistory.id.desc()
        )
    )

    return db.scalars(
        statement
    ).all()


@app.delete(
    "/systems/{system_id}/controls/{control_code}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_control(
    system_id: int,
    control_code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    system = get_system_or_404(
        db,
        system_id,
    )

    control = get_control_or_404(
        db,
        system_id,
        control_code,
    )

    for evidence in control.evidence:
        delete_physical_file(
            evidence.stored_filename
        )

    record_activity(
        db, current_user, "control.remove",
        f"Removed {control_label(system, control)} "
        f"with {len(control.evidence)} evidence file(s)",
    )
    db.delete(control)
    db.commit()

    recalculate_system(
        db,
        system,
    )

    return None


# ---------------------------------------------------------
# EVIDENCE
# ---------------------------------------------------------

def extract_or_fail(path: Path, suffix: str) -> ExtractionResult | None:
    """Extracted text, or None if the file could not be processed."""
    try:
        return extract_evidence_text(path, suffix.lower())
    except Exception:
        logger.exception("Evidence extraction failed for %s", path.name)
        return None


def apply_extraction(evidence: models.Evidence, extraction: ExtractionResult | None):
    if extraction is None:
        evidence.extracted_text = None
        evidence.extraction_status = "failed"
        evidence.extraction_method = None
        evidence.extraction_note = ""
        return

    evidence.extracted_text = extraction.text or None
    evidence.extraction_status = "completed" if extraction.text else "empty"
    evidence.extraction_method = extraction.method
    evidence.extraction_note = extraction.note


def describe_extraction(evidence: models.Evidence) -> str:
    detail = f"text: {evidence.extraction_status}"
    if evidence.extraction_method and evidence.extraction_method != "text":
        detail += f", {evidence.extraction_method}"
    return detail


@app.post(
    "/systems/{system_id}/controls/{control_code}/evidence",
    response_model=schemas.EvidenceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_evidence(
    system_id: int,
    control_code: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    system = get_system_or_404(
        db,
        system_id,
    )

    control = get_control_or_404(
        db,
        system_id,
        control_code,
    )

    original_filename = (
        file.filename or ""
    )

    suffix = Path(
        original_filename
    ).suffix.lower()

    if suffix not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only PDF, TXT, PNG, and JPEG "
                "evidence files are allowed."
            ),
        )

    allowed_content_types = (
        ALLOWED_FILE_TYPES[suffix]
    )

    content_type = (
        file.content_type
        or "application/octet-stream"
    )

    if (
        content_type
        not in allowed_content_types
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid file type for "
                "the selected extension."
            ),
        )

    stored_filename = (
        f"{uuid4().hex}{suffix}"
    )

    destination = (
        UPLOAD_DIR
        / stored_filename
    )

    total_size = 0

    try:
        with destination.open(
            "wb"
        ) as output_file:

            while True:
                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                total_size += len(
                    chunk
                )

                if (
                    total_size
                    > MAX_EVIDENCE_SIZE
                ):
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "Evidence file exceeds "
                            "the 10 MB limit."
                        ),
                    )

                output_file.write(
                    chunk
                )

    except Exception:
        if destination.exists():
            destination.unlink()

        raise

    finally:
        await file.close()

    # -----------------------------------------------------
    # CHECK IMAGES ARE REAL IMAGES
    # -----------------------------------------------------

    if suffix in IMAGE_FORMATS:
        try:
            content_type = await run_in_threadpool(
                validate_image, destination, suffix,
            )
        except InvalidImageError as error:
            destination.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            )

    # -----------------------------------------------------
    # EXTRACT TEXT
    # -----------------------------------------------------

    # OCR can take a while; run it off the event loop.
    extraction = await run_in_threadpool(
        extract_or_fail, destination, suffix,
    )

    # -----------------------------------------------------
    # SAVE EVIDENCE TO DATABASE
    # -----------------------------------------------------

    evidence = models.Evidence(
        system_control_id=control.id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        content_type=content_type,
        file_size=total_size,
    )
    apply_extraction(evidence, extraction)

    try:
        db.add(evidence)
        record_activity(
            db, current_user, "evidence.upload",
            f"Uploaded \"{original_filename}\" to "
            f"{control_label(system, control)} ({describe_extraction(evidence)})",
        )
        db.commit()
        db.refresh(evidence)

    except Exception:
        db.rollback()

        if destination.exists():
            destination.unlink()

        raise

    return evidence


@app.get(
    "/systems/{system_id}/controls/{control_code}/evidence",
    response_model=list[
        schemas.EvidenceResponse
    ],
)
def get_control_evidence(
    system_id: int,
    control_code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    control = get_control_or_404(
        db,
        system_id,
        control_code,
    )

    statement = (
        select(models.Evidence)
        .where(
            models.Evidence.system_control_id
            == control.id
        )
        .order_by(
            models.Evidence.id
        )
    )

    return db.scalars(
        statement
    ).all()


@app.get(
    "/evidence/{evidence_id}/text",
    response_model=schemas.EvidenceTextResponse,
)
def get_evidence_text(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    evidence = db.get(
        models.Evidence,
        evidence_id,
    )

    if evidence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence not found",
        )

    return evidence


@app.get(
    "/evidence/search",
    response_model=schemas.EvidenceSearchResponse,
)
def search_evidence_text(
    q: str = Query(..., min_length=2, max_length=200),
    system_id: int | None = Query(None, alias="systemId"),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    """Find evidence whose extracted text or filename has every term."""
    terms = parse_terms(q)

    if not terms:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Enter at least one search term of two or more characters.",
        )

    results, truncated = search_evidence(db, terms, system_id, limit)

    return {
        "terms": terms,
        "results": results,
        "truncated": truncated,
    }


@app.post(
    "/evidence/{evidence_id}/extract",
    response_model=schemas.EvidenceResponse,
)
async def reextract_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    """Run text extraction again, e.g. after OCR was installed."""
    evidence = db.get(models.Evidence, evidence_id)

    if evidence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence not found",
        )

    file_path = UPLOAD_DIR / evidence.stored_filename

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence file is missing from storage",
        )

    extraction = await run_in_threadpool(
        extract_or_fail, file_path, file_path.suffix,
    )
    apply_extraction(evidence, extraction)

    record_activity(
        db, current_user, "evidence.extract",
        f"Re-ran text extraction for \"{evidence.original_filename}\" on "
        f"{control_label(evidence.control.system, evidence.control)} "
        f"({describe_extraction(evidence)})",
    )
    db.commit()
    db.refresh(evidence)

    return evidence


@app.get(
    "/evidence/{evidence_id}/download"
)
def download_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    evidence = db.get(
        models.Evidence,
        evidence_id,
    )

    if evidence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence not found",
        )

    file_path = (
        UPLOAD_DIR
        / evidence.stored_filename
    )

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Evidence file is missing "
                "from storage"
            ),
        )

    return FileResponse(
        path=file_path,
        media_type=evidence.content_type,
        filename=evidence.original_filename,
    )

# ---------------------------------------------------------
# AI CONTROL ANALYSIS
# ---------------------------------------------------------

@app.post(
    "/systems/{system_id}/controls/{control_code}/analyze",
    response_model=schemas.AIAssessmentResponse,
)
def analyze_control(
    system_id: int,
    control_code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    system = get_system_or_404(
        db,
        system_id,
    )

    control = get_control_or_404(
        db,
        system_id,
        control_code,
    )

    usable_evidence = [
        evidence
        for evidence in control.evidence
        if (
            evidence.extraction_status
            == "completed"
            and evidence.extracted_text
        )
    ]

    if not usable_evidence:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No completed extracted "
                "evidence is available "
                "for AI analysis."
            ),
        )

    try:
        result, evidence_files = (
            analyze_control_evidence(
                control,
                usable_evidence,
            )
        )

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    except AIServiceError as error:
        record_activity(
            db, current_user, "ai.analyze_failed",
            f"AI analysis failed for {control_label(system, control)}: {error}",
        )
        db.commit()
        raise HTTPException(
            status_code=error.status_code,
            detail=str(error),
        )

    except Exception:
        logger.exception(
            "AI assessment failed for control %s",
            control_code,
        )
        record_activity(
            db, current_user, "ai.analyze_failed",
            f"AI analysis failed for {control_label(system, control)}",
        )
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI assessment failed.",
        )

    # Only the suggestion summary is logged; the analyst decides separately.
    record_activity(
        db, current_user, "ai.analyze",
        f"AI suggested {result.suggestedStatus} ({result.confidence} "
        f"confidence) for {control_label(system, control)} from "
        f"{len(evidence_files)} file(s)",
    )
    db.commit()

    return schemas.AIAssessmentResponse(
        **result.model_dump(),
        evidenceFiles=evidence_files,
    )

@app.delete(
    "/evidence/{evidence_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_editor),
):
    evidence = db.get(
        models.Evidence,
        evidence_id,
    )

    if evidence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence not found",
        )

    delete_physical_file(
        evidence.stored_filename
    )

    record_activity(
        db, current_user, "evidence.delete",
        f"Deleted \"{evidence.original_filename}\" from "
        f"{control_label(evidence.control.system, evidence.control)}",
    )
    db.delete(evidence)
    db.commit()

    return None
