"""Local accounts, password hashing, and session tokens.

Standard library only:
- Passwords are hashed with scrypt and a per-user random salt.
- Session tokens are random; only their SHA-256 hash is stored, so a
  database leak does not reveal usable tokens.
"""
import hashlib
import hmac
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .database import get_db


Role = Literal["admin", "analyst", "viewer"]

SESSION_LIFETIME = timedelta(hours=12)
MIN_PASSWORD_LENGTH = 12

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1

_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------
# PASSWORDS
# ---------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, n, r, p, salt_hex, digest_hex = stored.split("$")
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
        )
    except (ValueError, TypeError):
        return False

    return hmac.compare_digest(digest.hex(), digest_hex)


# Used when a username does not exist, so a failed login takes about
# as long whether or not the account exists.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def authenticate(db: Session, username: str, password: str):
    user = db.scalar(
        select(models.User).where(models.User.username == username)
    )

    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None

    return user if verify_password(password, user.password_hash) else None


# ---------------------------------------------------------
# FAILED SIGN-IN THROTTLE
# ---------------------------------------------------------

class LoginThrottle:
    """Slows password guessing with in-memory failure counters.

    - Each (client address, username) pair may fail MAX_PER_ACCOUNT
      times per WINDOW before that pair is blocked for the rest of the
      window. Keying on the pair means a stranger cannot lock a real
      user out from a different address.
    - Each client address may fail MAX_PER_CLIENT times per WINDOW in
      total, which limits trying many usernames from one address.

    Counters live in this process only: they reset on restart and are
    not shared between multiple server workers.
    """

    WINDOW = timedelta(minutes=15)
    MAX_PER_ACCOUNT = 5
    MAX_PER_CLIENT = 30

    def __init__(self):
        self._lock = threading.Lock()
        self._failures: dict[tuple, list[datetime]] = {}

    def _recent(self, key, now):
        cutoff = now - self.WINDOW
        attempts = [t for t in self._failures.get(key, []) if t > cutoff]

        if attempts:
            self._failures[key] = attempts
        else:
            self._failures.pop(key, None)

        return attempts

    def retry_after(self, client: str, username: str) -> int:
        """Seconds until another attempt is allowed; 0 when allowed now."""
        now = datetime.now(timezone.utc)
        username = username.lower()

        with self._lock:
            waits = []
            for key, limit in (
                (("account", client, username), self.MAX_PER_ACCOUNT),
                (("client", client), self.MAX_PER_CLIENT),
            ):
                attempts = self._recent(key, now)
                if len(attempts) >= limit:
                    waits.append(attempts[0] + self.WINDOW - now)

        if not waits:
            return 0

        return max(1, int(max(waits).total_seconds()) + 1)

    def record_failure(self, client: str, username: str) -> None:
        now = datetime.now(timezone.utc)
        username = username.lower()

        with self._lock:
            for key in (("account", client, username), ("client", client)):
                self._failures.setdefault(key, []).append(now)

    def record_success(self, client: str, username: str) -> None:
        with self._lock:
            self._failures.pop(("account", client, username.lower()), None)

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()


login_throttle = LoginThrottle()


def too_many_attempts(retry_after: int) -> HTTPException:
    minutes = max(1, round(retry_after / 60))
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            "Too many failed sign-in attempts. "
            f"Try again in about {minutes} minute{'s' if minutes != 1 else ''}."
        ),
        headers={"Retry-After": str(retry_after)},
    )


# ---------------------------------------------------------
# SESSIONS
# ---------------------------------------------------------

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes; PostgreSQL returns aware ones.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def create_session(db: Session, user: models.User) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + SESSION_LIFETIME

    # Opportunistically remove this user's expired sessions.
    for session in list(user.sessions):
        if _as_utc(session.expires_at) <= datetime.now(timezone.utc):
            db.delete(session)

    db.add(
        models.UserSession(
            user_id=user.id,
            token_hash=_hash_token(token),
            expires_at=expires_at,
        )
    )
    db.commit()

    return token, expires_at


def revoke_other_sessions(db: Session, user: models.User, token: str) -> None:
    keep = _hash_token(token)

    for session in list(user.sessions):
        if session.token_hash != keep:
            db.delete(session)


def revoke_session(db: Session, token: str) -> None:
    session = db.scalar(
        select(models.UserSession).where(
            models.UserSession.token_hash == _hash_token(token)
        )
    )

    if session is not None:
        db.delete(session)
        db.commit()


# ---------------------------------------------------------
# DEPENDENCIES
# ---------------------------------------------------------

def _unauthorized(detail="Sign in to continue."):
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    return credentials.credentials


def get_current_user(
    token: str = Depends(get_current_token),
    db: Session = Depends(get_db),
) -> models.User:
    session = db.scalar(
        select(models.UserSession).where(
            models.UserSession.token_hash == _hash_token(token)
        )
    )

    if session is None:
        raise _unauthorized()

    if _as_utc(session.expires_at) <= datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise _unauthorized("Your session has expired. Sign in again.")

    return session.user


def require_role(*roles: str):
    def dependency(
        user: models.User = Depends(get_current_user),
    ) -> models.User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not allow this action.",
            )
        return user

    return dependency


require_user = get_current_user
require_editor = require_role("admin", "analyst")
require_admin = require_role("admin")
