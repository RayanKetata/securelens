"""Optical character recognition with the Tesseract command-line tool.

Tesseract is a separate program, not a Python package. It is installed
in the Docker image; for local development install it and make sure
`tesseract` is on PATH, or set TESSERACT_CMD to its full path. Without
it, OCR is skipped and scanned PDFs are stored with no text, as before.
"""
import logging
import re
import shutil
import subprocess
from functools import lru_cache

from .config import settings


logger = logging.getLogger(__name__)

# Seconds Tesseract may spend on one page image.
PAGE_TIMEOUT = 30

# Language codes such as "eng" or "eng+fra"; rejects anything that
# could be read as a command-line option.
_LANGUAGES = re.compile(r"^[A-Za-z_]+(\+[A-Za-z_]+)*$")


class OCRError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def tesseract_path() -> str | None:
    if not settings.ocr_enabled:
        return None

    path = shutil.which(settings.tesseract_cmd)

    if path is None:
        logger.warning(
            "OCR is enabled but Tesseract was not found (%s); "
            "scanned PDFs will have no text.",
            settings.tesseract_cmd,
        )

    return path


def ocr_available() -> bool:
    return tesseract_path() is not None


def run_tesseract(png_bytes: bytes) -> str:
    """Return the text Tesseract reads from one PNG image."""
    path = tesseract_path()

    if path is None:
        raise OCRError("Tesseract is not available.")

    languages = settings.ocr_languages.strip()

    if not _LANGUAGES.fullmatch(languages):
        raise OCRError("OCR_LANGUAGES must look like 'eng' or 'eng+fra'.")

    try:
        completed = subprocess.run(
            [path, "stdin", "stdout", "-l", languages],
            input=png_bytes,
            capture_output=True,
            timeout=PAGE_TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise OCRError("Tesseract timed out.") from error
    except OSError as error:
        raise OCRError(f"Tesseract could not run: {error}") from error

    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", "replace").strip()[:300]
        raise OCRError(f"Tesseract failed: {detail}")

    return completed.stdout.decode("utf-8", "replace").strip()
