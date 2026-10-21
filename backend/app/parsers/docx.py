"""Word (.docx) extraction using heading styles."""

import io
import re

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.parsers.base import ParseError

_HEADING = re.compile(r"^Heading\s*(\d)$", re.IGNORECASE)


def _paragraph_line(p: Paragraph) -> str | None:
    text = p.text.strip()
    if not text:
        return None
    style = (p.style.name if p.style is not None else "") or ""
    if style.lower() == "title":
        return f"# {text}"
    match = _HEADING.match(style)
    if match:
        return f"{'#' * min(int(match.group(1)) or 1, 6)} {text}"
    if "list" in style.lower():
        return f"- {text}"
    return text


def _table_lines(table: Table) -> list[str]:
    rows = []
    for row in table.rows:
        cells: list[str] = []
        for cell in row.cells:
            value = " ".join(cell.text.split())
            if not cells or cells[-1] != value:  # merged cells repeat
                cells.append(value)
        if any(cells):
            rows.append(" | ".join(cells))
    return rows


def parse_docx(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:
        raise ParseError("Could not open this .docx file. It may be corrupt.") from exc

    out: list[str] = []
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            line = _paragraph_line(Paragraph(child, doc))
            if line:
                out.append(line)
        elif tag == "tbl":
            out.extend(_table_lines(Table(child, doc)))
    return "\n\n".join(out)
