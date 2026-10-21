"""Parser registry: pick a parser by file extension."""

from collections.abc import Callable
from pathlib import PurePath

from app.models import SourceType
from app.parsers.base import EmptyDocumentError, ParsedDocument, ParseError, clean
from app.parsers.docx import parse_docx
from app.parsers.pdf import parse_pdf
from app.parsers.pptx import parse_pptx
from app.parsers.text import parse_text

PARSERS: dict[str, tuple[SourceType, Callable[[bytes], str]]] = {
    ".pdf": ("pdf", parse_pdf),
    ".docx": ("docx", parse_docx),
    ".pptx": ("pptx", parse_pptx),
    ".md": ("md", parse_text),
    ".markdown": ("md", parse_text),
    ".txt": ("txt", parse_text),
}

SUPPORTED_EXTENSIONS = sorted(PARSERS)


def parse_file(filename: str, data: bytes) -> ParsedDocument:
    ext = PurePath(filename).suffix.lower()
    entry = PARSERS.get(ext)
    if entry is None:
        supported = ", ".join(SUPPORTED_EXTENSIONS)
        raise ParseError(
            f"Unsupported file type '{ext or filename}'. Supported types: {supported}."
        )
    source_type, parser = entry
    text = clean(parser(data))
    if not text:
        raise EmptyDocumentError("No extractable text found in this file.")
    return ParsedDocument(text=text, source_type=source_type)


def parse_pasted(text: str) -> ParsedDocument:
    """Pasted text is treated like Markdown."""
    cleaned = clean(text)
    if not cleaned:
        raise EmptyDocumentError("The pasted text is empty.")
    return ParsedDocument(text=cleaned, source_type="text")


__all__ = [
    "SUPPORTED_EXTENSIONS",
    "EmptyDocumentError",
    "ParseError",
    "ParsedDocument",
    "parse_file",
    "parse_pasted",
]
