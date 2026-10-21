from pathlib import Path

import pytest

from app.parsers import EmptyDocumentError, ParseError, parse_file, parse_pasted

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return parse_file(name, (FIXTURES / name).read_bytes())


def test_markdown_passthrough():
    doc = load("sample.md")
    assert doc.source_type == "md"
    assert "## Photosynthesis" in doc.text
    assert "Cells release energy from glucose." in doc.text


def test_pdf_headings_detected_by_font_size():
    doc = load("sample.pdf")
    assert doc.source_type == "pdf"
    lines = doc.text.splitlines()
    assert "# Sample Guide" in lines
    assert "## Photosynthesis" in lines
    assert "## Respiration" in lines
    assert any("Plants convert light" in ln and not ln.startswith("#") for ln in lines)


def test_scanned_pdf_gives_clear_message():
    with pytest.raises(EmptyDocumentError, match="scanned PDF"):
        load("blank.pdf")


def test_docx_headings_lists_and_tables():
    doc = load("sample.docx")
    lines = doc.text.splitlines()
    assert "# Sample Guide" in lines
    assert "## Photosynthesis" in lines
    assert "- Chlorophyll" in lines
    assert "Term | Meaning" in lines
    assert "ATP | Energy currency" in lines


def test_pptx_titles_body_and_notes():
    doc = load("sample.pptx")
    lines = doc.text.splitlines()
    assert "# Photosynthesis" in lines
    assert "Light reactions" in lines
    assert "Speaker notes: Mention chloroplasts." in lines
    assert "# Respiration" in lines


def test_pasted_text_is_markdown_like():
    doc = parse_pasted("# Title\n\n\n\nBody")
    assert doc.source_type == "text"
    assert doc.text == "# Title\n\nBody"


def test_empty_inputs_rejected():
    with pytest.raises(EmptyDocumentError):
        parse_pasted("   \n  ")
    with pytest.raises(EmptyDocumentError):
        parse_file("empty.txt", b"  \n")


def test_unsupported_extension():
    with pytest.raises(ParseError, match="Unsupported file type"):
        parse_file("notes.xyz", b"hi")


def test_corrupt_files_give_parse_errors():
    for name in ("bad.pdf", "bad.docx", "bad.pptx"):
        with pytest.raises(ParseError):
            parse_file(name, b"not really a document")


def test_text_decoding_fallback():
    doc = parse_file("latin.txt", "caf\xe9".encode("cp1252"))
    assert doc.text == "caf\xe9"
