"""PDF text extraction with font-size heading heuristics."""

from collections import Counter
from dataclasses import dataclass

import pymupdf

from app.parsers.base import EmptyDocumentError, ParseError

MAX_HEADING_CHARS = 120
HEADING_RATIO = 1.15
MAX_HEADING_LEVELS = 3


@dataclass
class _Line:
    text: str
    size: float
    bold: bool


def _lines(page: pymupdf.Page) -> list[_Line]:
    lines: list[_Line] = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:  # skip image blocks
            continue
        for line in block["lines"]:
            spans = [s for s in line["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in line["spans"]).strip()
            weights = Counter()
            for s in spans:
                weights[round(s["size"], 1)] += len(s["text"])
            size = weights.most_common(1)[0][0]
            bold = all(bool(s["flags"] & 16) or "bold" in s["font"].lower() for s in spans)
            lines.append(_Line(text=text, size=size, bold=bold))
    return lines


def parse_pdf(data: bytes) -> str:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ParseError("Could not open this PDF. It may be corrupt or encrypted.") from exc
    with doc:
        if doc.needs_pass:
            raise ParseError("This PDF is password protected.")
        pages = [_lines(page) for page in doc]

    all_lines = [line for page in pages for line in page]
    if not all_lines:
        raise EmptyDocumentError(
            "No extractable text found. This looks like a scanned PDF "
            "(OCR is not supported). Try a PDF with a text layer."
        )

    sizes: Counter[float] = Counter()
    for line in all_lines:
        sizes[line.size] += len(line.text)
    body = sizes.most_common(1)[0][0]
    heading_sizes = sorted(
        {ln.size for ln in all_lines if ln.size >= body * HEADING_RATIO}, reverse=True
    )[:MAX_HEADING_LEVELS]
    level_for = {size: i + 1 for i, size in enumerate(heading_sizes)}

    out: list[str] = []
    paragraph: list[str] = []

    def flush() -> None:
        if paragraph:
            out.append(" ".join(paragraph))
            paragraph.clear()

    for page in pages:
        for line in page:
            level = level_for.get(line.size)
            if level and len(line.text) <= MAX_HEADING_CHARS:
                flush()
                out.append(f"{'#' * level} {line.text}")
            else:
                # Bullets and numbered items stay on their own lines.
                if line.text[:2] in ("• ", "- ", "– ", "* ") or line.text[:3].rstrip(".").isdigit():
                    flush()
                    out.append(line.text)
                else:
                    paragraph.append(line.text)
        flush()
    return "\n\n".join(out)
