
"""Extract plain text from PDF and DOCX documents.

This module does not review CVs, call an LLM, or access a database.
"""

from io import BytesIO
from pathlib import Path

from docx import Document
from pypdf import PdfReader


MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB


class DocumentExtractionError(ValueError):
    """Raised when a document cannot be safely or meaningfully extracted."""


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract plain text from PDF or DOCX file bytes.

    Args:
        file_bytes: Contents of the uploaded document.
        filename: Original filename, used to determine the format.

    Returns:
        Extracted text with paragraph breaks where possible.

    Raises:
        DocumentExtractionError: For unsupported, invalid, oversized,
            empty, or textless documents.
    """
    if not isinstance(file_bytes, bytes):
        raise DocumentExtractionError(
            "Invalid file data. Expected uploaded file bytes."
        )

    if not isinstance(filename, str) or not filename.strip():
        raise DocumentExtractionError("A valid filename is required.")

    if not file_bytes:
        raise DocumentExtractionError("The uploaded file is empty.")

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise DocumentExtractionError(
            "File is too large. Maximum upload size is 2 MB."
        )

    extension = Path(filename).suffix.lower()

    if extension not in {".pdf", ".docx"}:
        raise DocumentExtractionError(
            "Unsupported file format. Upload a PDF or DOCX file."
        )

    try:
        if extension == ".pdf":
            text = _extract_pdf(file_bytes)
        else:
            text = _extract_docx(file_bytes)

    except DocumentExtractionError:
        raise
    except Exception as exc:
        raise DocumentExtractionError(
            "The file is invalid or could not be read. "
            "Please upload a valid PDF or DOCX document."
        ) from exc

    text = _clean_text(text)

    if not text:
        if extension == ".pdf":
            raise DocumentExtractionError(
                "No readable text was found in the PDF. "
                "It may be scanned or contain only images. "
                "Please upload a text-based PDF."
            )

        raise DocumentExtractionError(
            "No readable text was found in the DOCX document."
        )

    return text


def _extract_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF without creating a permanent file."""
    reader = PdfReader(BytesIO(file_bytes), strict=True)

    if reader.is_encrypted:
        raise DocumentExtractionError(
            "Password-protected PDFs are not supported."
        )

    paragraphs = []

    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            paragraphs.append(page_text.strip())

    return "\n\n".join(paragraphs)


def _extract_docx(file_bytes: bytes) -> str:
    """Extract paragraphs from a DOCX document held in memory."""
    document = Document(BytesIO(file_bytes))

    paragraphs = [
        paragraph.text.strip()
        for paragraph in document.paragraphs
        if paragraph.text.strip()
    ]

    return "\n\n".join(paragraphs)


def _clean_text(text: str) -> str:
    """Normalize line endings and remove unnecessary whitespace."""
    lines = [line.rstrip() for line in text.splitlines()]
    return "\n".join(lines).strip()
