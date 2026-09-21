from pathlib import Path
from uuid import uuid4

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .database import Base, engine, get_db
from .evidence_text import extract_text_from_file
from .ai_assessment import AIServiceError, analyze_control_evidence
from . import models, schemas


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


Base.metadata.create_all(bind=engine)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SecureLens API",
    }


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


@app.delete(
    "/systems/{system_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_system(
    system_id: int,
    db: Session = Depends(get_db),
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

    db.add(control)
    db.commit()
    db.refresh(control)

    recalculate_system(
        db,
        system,
    )

    return control


@app.delete(
    "/systems/{system_id}/controls/{control_code}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_control(
    system_id: int,
    control_code: str,
    db: Session = Depends(get_db),
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
):
    get_system_or_404(
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
                "Only PDF and TXT "
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
    # EXTRACT TEXT
    # -----------------------------------------------------

    extracted_text = None
    extraction_status = "pending"

    try:
        extracted_text = (
            extract_text_from_file(
                destination,
                suffix,
            )
        )

        if extracted_text:
            extraction_status = (
                "completed"
            )
        else:
            extraction_status = (
                "empty"
            )

    except Exception as error:
        print(
            "Evidence extraction failed:",
            error,
        )

        extraction_status = "failed"

    # -----------------------------------------------------
    # SAVE EVIDENCE TO DATABASE
    # -----------------------------------------------------

    evidence = models.Evidence(
        system_control_id=control.id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        content_type=content_type,
        file_size=total_size,
        extracted_text=extracted_text,
        extraction_status=extraction_status,
    )

    try:
        db.add(evidence)
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
    "/evidence/{evidence_id}/download"
)
def download_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
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
):
    get_system_or_404(
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
        raise HTTPException(
            status_code=error.status_code,
            detail=str(error),
        )

    except Exception as error:
        print(
            "AI assessment failed:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI assessment failed.",
        )

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

    db.delete(evidence)
    db.commit()

    return None
