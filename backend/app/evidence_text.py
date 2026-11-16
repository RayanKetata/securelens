"""Text extraction for evidence files, with OCR for scanned PDF pages."""
import io
import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

from . import ocr


logger = logging.getLogger(__name__)

# A page whose text layer has fewer readable characters than this is
# treated as scanned and sent to OCR.
MIN_PAGE_TEXT_CHARS = 20

# Limits that keep one upload from tying up the server.
MAX_OCR_PAGES = 30
OCR_TIME_BUDGET = 90  # seconds for all OCR in one file

# Render at 300 DPI, but never wider or taller than this many pixels.
OCR_DPI = 300
MAX_RENDER_PIXELS = 4000

# PDFium is not thread-safe; uploads run in a thread pool.
_pdfium_lock = threading.Lock()


@dataclass
class ExtractionResult:
    text: str
    # "text" (text layer only), "ocr" (OCR only), "text+ocr", or None
    # when no text was found.
    method: str | None
    # Plain-language caveat, e.g. pages that OCR skipped.
    note: str = ""


def _readable_length(text: str) -> int:
    return sum(1 for character in text if not character.isspace())


def _render_page_png(pdf, index: int) -> bytes:
    with _pdfium_lock:
        page = pdf[index]
        try:
            width, height = page.get_size()
            scale = min(
                OCR_DPI / 72,
                MAX_RENDER_PIXELS / max(width, height, 1),
            )
            bitmap = page.render(scale=scale, grayscale=True)
            image = bitmap.to_pil()
        finally:
            page.close()

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _describe_pages(numbers: list[int]) -> str:
    shown = ", ".join(str(number) for number in numbers[:10])
    if len(numbers) > 10:
        shown += f" and {len(numbers) - 10} more"
    return shown


def _extract_pdf(file_path: Path) -> ExtractionResult:
    reader = PdfReader(str(file_path))
    layer_texts = [
        (page.extract_text() or "").strip()
        for page in reader.pages
    ]

    scanned = [
        index
        for index, text in enumerate(layer_texts)
        if _readable_length(text) < MIN_PAGE_TEXT_CHARS
    ]

    page_texts = list(layer_texts)
    ocr_pages = []
    skipped = []
    notes = []

    if scanned and ocr.ocr_available():
        import pypdfium2

        started = time.monotonic()

        with _pdfium_lock:
            pdf = pypdfium2.PdfDocument(str(file_path))

        try:
            for position, index in enumerate(scanned):
                out_of_budget = (
                    position >= MAX_OCR_PAGES
                    or time.monotonic() - started > OCR_TIME_BUDGET
                )

                if out_of_budget:
                    skipped.extend(scanned[position:])
                    notes.append(
                        "OCR stopped at its limit of "
                        f"{MAX_OCR_PAGES} pages or {OCR_TIME_BUDGET} seconds"
                    )
                    break

                try:
                    recognized = ocr.run_tesseract(
                        _render_page_png(pdf, index)
                    )
                except ocr.OCRError:
                    logger.warning(
                        "OCR failed on page %d of %s",
                        index + 1, file_path.name, exc_info=True,
                    )
                    skipped.append(index)
                    continue

                if _readable_length(recognized) > _readable_length(page_texts[index]):
                    page_texts[index] = recognized
                    ocr_pages.append(index)
        finally:
            with _pdfium_lock:
                pdf.close()

        if skipped:
            notes.insert(0, "OCR could not read page " + _describe_pages(
                [index + 1 for index in skipped]
            ))

    elif scanned and len(scanned) == len(layer_texts):
        notes.append(
            "No text layer was found and OCR is not available on the server"
        )
    elif scanned:
        notes.append(
            "Page " + _describe_pages([index + 1 for index in scanned])
            + " had no text layer and OCR is not available on the server"
        )

    text = "\n\n".join(text for text in page_texts if text).strip()

    layer_pages = [
        index for index, page_text in enumerate(page_texts)
        if page_text and index not in ocr_pages
    ]

    if not text:
        method = None
    elif ocr_pages and layer_pages:
        method = "text+ocr"
    elif ocr_pages:
        method = "ocr"
    else:
        method = "text"

    if method == "text+ocr":
        notes.insert(0, "OCR was used for page " + _describe_pages(
            [index + 1 for index in ocr_pages]
        ))

    return ExtractionResult(text, method, "; ".join(notes)[:200])


# Image evidence (screenshots, photos of documents).
IMAGE_FORMATS = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG"}
IMAGE_CONTENT_TYPES = {"PNG": "image/png", "JPEG": "image/jpeg"}
# Larger than a 48-megapixel photo; refuses "decompression bombs".
MAX_IMAGE_PIXELS = 50_000_000
# Screenshots are low resolution; enlarging small ones helps Tesseract.
UPSCALE_BELOW = 1500


class InvalidImageError(ValueError):
    pass


def validate_image(file_path: Path, extension: str) -> str:
    """Check that the file really is the image its extension says.

    Returns the content type to store and serve, decided from the file
    itself rather than from what the browser claimed.
    """
    from PIL import Image

    expected = IMAGE_FORMATS[extension.lower()]

    try:
        with Image.open(file_path) as image:
            if image.format != expected:
                raise InvalidImageError(
                    f"The file is not a valid {expected} image."
                )
            width, height = image.size
            if width * height > MAX_IMAGE_PIXELS:
                raise InvalidImageError(
                    "The image is too large (over 50 megapixels)."
                )
            image.verify()
    except InvalidImageError:
        raise
    except Image.DecompressionBombError as error:
        raise InvalidImageError(
            "The image is too large (over 50 megapixels)."
        ) from error
    except Exception as error:
        raise InvalidImageError(
            f"The file is not a valid {expected} image."
        ) from error

    return IMAGE_CONTENT_TYPES[expected]


def _prepare_image_png(file_path: Path) -> bytes:
    from PIL import Image, ImageOps

    with Image.open(file_path) as original:
        if original.size[0] * original.size[1] > MAX_IMAGE_PIXELS:
            raise InvalidImageError("The image is too large.")
        # Phone photos store their rotation separately; apply it.
        image = ImageOps.exif_transpose(original).convert("L")

    longest = max(image.size)
    if longest < UPSCALE_BELOW:
        factor = min(2, MAX_RENDER_PIXELS / max(longest, 1))
    elif longest > MAX_RENDER_PIXELS:
        factor = MAX_RENDER_PIXELS / longest
    else:
        factor = 1

    if factor != 1:
        image = image.resize(
            (max(1, round(image.width * factor)), max(1, round(image.height * factor))),
            Image.Resampling.LANCZOS,
        )

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _extract_image(file_path: Path) -> ExtractionResult:
    if not ocr.ocr_available():
        return ExtractionResult(
            "", None, "Images need OCR, which is not available on the server"
        )

    png = _prepare_image_png(file_path)

    try:
        text = ocr.run_tesseract(png)
    except ocr.OCRError:
        logger.warning("OCR failed on %s", file_path.name, exc_info=True)
        return ExtractionResult("", None, "OCR could not read the image")

    if not text:
        return ExtractionResult("", None, "OCR found no text in the image")

    return ExtractionResult(text, "ocr")


def extract_evidence_text(file_path: Path, extension: str) -> ExtractionResult:
    extension = extension.lower()

    if extension == ".txt":
        text = file_path.read_text(encoding="utf-8", errors="replace").strip()
        return ExtractionResult(text, "text" if text else None)

    if extension == ".pdf":
        return _extract_pdf(file_path)

    if extension in IMAGE_FORMATS:
        return _extract_image(file_path)

    raise ValueError("Unsupported evidence file type.")


def extract_text_from_file(file_path: Path, extension: str) -> str:
    """Text only; kept for callers that do not need the details."""
    return extract_evidence_text(file_path, extension).text
