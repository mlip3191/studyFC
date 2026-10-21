from app.llm.merge import CardAccumulator, RawCard, group_key, normalize_name


def rc(front: str, group: str, back: str = "ans", type_: str = "qa") -> RawCard:
    return RawCard(type=type_, front=front, back=back, group_name=group)


def test_group_key_collapses_case_space_and_plurals():
    assert group_key("Porter's Five Forces") == group_key("  porters  five force ")
    assert group_key("Market Segments") == group_key("market segment")
    assert group_key("Strategies") == group_key("Strategy")
    assert group_key("Supply & Demand") == group_key("supply and demand")
    assert group_key("Business") != group_key("Busines x")


def test_group_key_keeps_distinct_names_distinct():
    assert group_key("Costs") != group_key("Cost Leadership")
    assert group_key("Analysis") == group_key("Analysis")  # words ending in -is untouched


def test_normalize_name():
    assert normalize_name("  Five   Forces: ") == "Five Forces"
    assert normalize_name("  ") == "General"


def test_near_duplicate_groups_merge_keeping_first_name():
    acc = CardAccumulator()
    acc.add([rc("a?", "Five Forces"), rc("b?", "five  force"), rc("c?", "FIVE FORCES")])
    groups, cards = acc.build()
    assert [g.name for g in groups] == ["Five Forces"]
    assert len(cards) == 3
    assert {c.group_id for c in cards} == {groups[0].id}


def test_duplicate_cards_dropped_across_chunks_and_counted():
    acc = CardAccumulator()
    acc.add([rc("What is X?", "A")])
    acc.add([rc("what is x", "B"), rc("What is Y?", "B")])
    groups, cards = acc.build()
    assert [c.front for c in cards] == ["What is X?", "What is Y?"]
    assert acc.duplicates_dropped == 1


def test_groups_with_no_surviving_cards_are_omitted_and_order_is_contiguous():
    acc = CardAccumulator()
    acc.add([rc("q1", "A"), rc("q1", "B"), rc("q2", "C")])
    groups, cards = acc.build()
    assert [(g.name, g.order) for g in groups] == [("A", 0), ("C", 1)]
    assert len(cards) == 2


def test_group_names_for_prompt_in_first_seen_order():
    acc = CardAccumulator()
    acc.add([rc("q1", "Beta"), rc("q2", "Alpha"), rc("q3", "beta")])
    assert acc.group_names() == ["Beta", "Alpha"]


def test_empty_cards_skipped_and_ids_unique():
    acc = CardAccumulator()
    acc.add([rc("", "A"), rc("q", "A", back="")] + [rc(f"q{i}", f"G{i % 3}") for i in range(40)])
    groups, cards = acc.build()
    assert len(cards) == 40
    ids = [g.id for g in groups] + [c.id for c in cards]
    assert len(ids) == len(set(ids))


def test_rawcard_whitespace_normalized():
    card = RawCard(type="term", front="  Hello \n world ", back=" b ", group_name=" g  h ")
    assert (card.front, card.back, card.group_name) == ("Hello world", "b", "g h")
