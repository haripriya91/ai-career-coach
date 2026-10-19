
from pathlib import Path

from src.document_tools import (
    DocumentExtractionError,
    extract_text,
)


# The sample_data folder is at the repository root.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SAMPLE_DIR = PROJECT_ROOT / "sample_data"


def test_sample_file(filename: str) -> None:
    """Extract and display text from one sample document."""
    path = SAMPLE_DIR / filename

    if not path.is_file():
        print(f"\nMISSING SAMPLE FILE: {path}")
        return

    try:
        file_bytes = path.read_bytes()
        extracted_text = extract_text(file_bytes, path.name)

        print(f"\n--- {filename}: SUCCESS ---")
        print(extracted_text)

    except DocumentExtractionError as exc:
        print(f"\n--- {filename}: EXTRACTION ERROR ---")
        print(exc)


def test_invalid_inputs() -> None:
    """Check the main validation and error cases."""
    tests = [
        ("Unsupported format", b"some content", "sample.txt"),
        ("Empty file", b"", "sample.pdf"),
        ("Oversized file", b"x" * (2 * 1024 * 1024 + 1), "large.pdf"),
        ("Invalid PDF", b"not a real PDF", "broken.pdf"),
        ("Invalid DOCX", b"not a real DOCX", "broken.docx"),
    ]

    print("\n--- Error handling tests ---")

    for label, data, filename in tests:
        try:
            extract_text(data, filename)
            print(f"FAIL: {label} was accepted")
        except DocumentExtractionError as exc:
            print(f"PASS: {label}: {exc}")


if __name__ == "__main__":
    test_sample_file("sample_cv.pdf")
    test_sample_file("sample_cv.docx")
    test_invalid_inputs()
