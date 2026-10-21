from app.llm.chunking import chunk_document, split_in_half, split_sections


def doc(*sections: tuple[str, str]) -> str:
    return "\n\n".join(f"## {h}\n\n{body}" for h, body in sections)


def test_split_sections_keeps_preamble_and_headings():
    sections = split_sections("Intro\n\n# A\n\nbody a\n\n## B\n\nbody b")
    assert [s.heading for s in sections] == ["", "# A", "## B"]
    assert sections[1].text.startswith("# A")


def test_headings_inside_code_fences_are_ignored():
    sections = split_sections("# A\n\n```\n# not a heading\n```\n\ntext")
    assert len(sections) == 1


def test_short_document_is_one_chunk():
    text = doc(("A", "aaa"), ("B", "bbb"))
    assert chunk_document(text, max_chars=1000) == [text]


def test_chunks_break_on_section_boundaries_only():
    sections = [(f"S{i}", "x" * 100) for i in range(6)]
    chunks = chunk_document(doc(*sections), max_chars=300)
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk) <= 300
        # no section is cut: every chunk starts at a heading and holds whole 100-char bodies
        assert chunk.startswith("## S")
        assert chunk.count("## S") == chunk.count("x" * 100)
    joined = "\n\n".join(chunks)
    for i in range(6):
        assert f"## S{i}" in joined


def test_oversize_section_split_on_paragraphs_with_heading_repeated():
    paragraphs = "\n\n".join(f"para {i} " + "y" * 90 for i in range(10))
    text = f"## Big\n\n{paragraphs}"
    chunks = chunk_document(text, max_chars=300)
    assert len(chunks) > 1
    assert all(len(c) <= 300 for c in chunks)
    assert chunks[0].startswith("## Big")
    assert all(c.startswith("## Big (continued)") for c in chunks[1:])
    assert all(f"para {i} " in "\n".join(chunks) for i in range(10))


def test_oversize_section_does_not_swallow_neighbours():
    text = doc(("Small", "s" * 50)) + "\n\n## Big\n\n" + "\n\n".join("z" * 90 for _ in range(8))
    chunks = chunk_document(text, max_chars=300)
    assert chunks[0].startswith("## Small")
    assert "## Big" not in chunks[0]


def test_single_giant_paragraph_is_hard_split():
    chunks = chunk_document("## T\n\n" + "w" * 1000, max_chars=300)
    assert all(len(c) <= 300 for c in chunks)
    assert sum(c.count("w") for c in chunks) == 1000


def test_split_in_half_prefers_paragraph_break():
    parts = split_in_half("one\n\ntwo\n\nthree\n\nfour")
    assert len(parts) == 2
    assert "\n\n".join(parts) == "one\n\ntwo\n\nthree\n\nfour"
    assert split_in_half("abcdef") == ["abc", "def"]
