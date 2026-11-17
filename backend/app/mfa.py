"""Multi-factor authentication with authenticator apps (TOTP, RFC 6238).

Standard library only. Codes are 6 digits, change every 30 seconds,
and use HMAC-SHA1, which is what Google Authenticator, Microsoft
Authenticator, 1Password, and similar apps expect.

- A code is accepted for one 30-second step either side of now, to
  allow for clock drift.
- A code cannot be used twice: the last accepted step is stored and
  any code for that step or an earlier one is refused.
- Recovery codes are random, single use, and only their SHA-256 hash
  is stored.
"""
import base64
import hashlib
import hmac
import json
import secrets
import struct
import time
from urllib.parse import quote, urlencode

ISSUER = "SecureLens"
DIGITS = 6
PERIOD = 30
DRIFT_STEPS = 1
RECOVERY_CODE_COUNT = 8


def new_secret() -> str:
    """A random 160-bit secret, base32-encoded without padding."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _key(secret: str) -> bytes:
    padded = secret.upper() + "=" * (-len(secret) % 8)
    return base64.b32decode(padded)


def code_at(secret: str, step: int) -> str:
    digest = hmac.new(_key(secret), struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // PERIOD)


def normalize_code(code: str) -> str:
    return "".join(code.split()).replace("-", "")


def verify_code(secret: str, code: str, last_step: int | None = None,
                now: float | None = None) -> int | None:
    """The step the code belongs to, or None if it is wrong or reused."""
    code = normalize_code(code)
    if len(code) != DIGITS or not code.isdigit():
        return None

    step = current_step(now)
    for candidate in range(step - DRIFT_STEPS, step + DRIFT_STEPS + 1):
        if last_step is not None and candidate <= last_step:
            continue
        if hmac.compare_digest(code_at(secret, candidate), code):
            return candidate

    return None


def provisioning_uri(secret: str, username: str) -> str:
    """The otpauth:// link an authenticator app reads from a QR code."""
    label = quote(f"{ISSUER}:{username}")
    query = urlencode({
        "secret": secret,
        "issuer": ISSUER,
        "algorithm": "SHA1",
        "digits": DIGITS,
        "period": PERIOD,
    })
    return f"otpauth://totp/{label}?{query}"


# ---------------------------------------------------------
# RECOVERY CODES
# ---------------------------------------------------------

_RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o, 1/l/i


def _hash_recovery(code: str) -> str:
    return hashlib.sha256(normalize_code(code).lower().encode("utf-8")).hexdigest()


def new_recovery_codes() -> tuple[list[str], str]:
    """Plain codes to show once, and the JSON of their hashes to store."""
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")

    return codes, json.dumps([_hash_recovery(code) for code in codes])


def use_recovery_code(stored: str | None, code: str) -> str | None:
    """The updated JSON with the code removed, or None if it does not match."""
    if not stored:
        return None

    hashes = json.loads(stored)
    candidate = _hash_recovery(code)

    for index, value in enumerate(hashes):
        if hmac.compare_digest(value, candidate):
            del hashes[index]
            return json.dumps(hashes)

    return None


def recovery_codes_left(stored: str | None) -> int:
    return len(json.loads(stored)) if stored else 0
