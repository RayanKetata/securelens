from pathlib import Path

from pypdf import PdfReader


def extract_text_from_file(
    file_path: Path,
    extension: str,
) -> str:
    extension = extension.lower()

    if extension == ".txt":
        return file_path.read_text(
            encoding="utf-8",
            errors="replace",
        ).strip()

    if extension == ".pdf":
        reader = PdfReader(str(file_path))

        extracted_pages = []

        for page in reader.pages:
            text = page.extract_text() or ""

            if text.strip():
                extracted_pages.append(
                    text.strip()
                )

        return "\n\n".join(
            extracted_pages
        ).strip()

    raise ValueError(
        "Unsupported evidence file type."
    )