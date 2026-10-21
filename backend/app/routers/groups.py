from fastapi import APIRouter, Depends, HTTPException

from app.llm.merge import group_key, normalize_name
from app.models import Deck, Group, new_id
from app.routers.deps import get_repo
from app.routers.schemas import GroupCreate, GroupMerge, GroupPatch
from app.storage import DeckRepository

router = APIRouter(prefix="/decks/{deck_id}/groups", tags=["groups"])


def _require_group(deck: Deck, group_id: str) -> Group:
    group = deck.group_by_id(group_id)
    if group is None:
        raise HTTPException(404, f"Group '{group_id}' not found")
    return group


def _check_name_free(deck: Deck, name: str, ignore_id: str | None = None) -> None:
    key = group_key(name)
    for group in deck.groups:
        if group.id != ignore_id and group_key(group.name) == key:
            raise HTTPException(409, f"A group named '{group.name}' already exists")


def _renumber(deck: Deck) -> None:
    deck.groups.sort(key=lambda g: g.order)
    for index, group in enumerate(deck.groups):
        group.order = index


@router.post("", response_model=Deck, status_code=201)
def create_group(deck_id: str, body: GroupCreate, repo: DeckRepository = Depends(get_repo)) -> Deck:
    name = normalize_name(body.name)

    def mutate(deck: Deck) -> None:
        _check_name_free(deck, name)
        deck.groups.append(Group(id=new_id(deck.all_ids()), name=name, order=len(deck.groups)))

    return repo.update(deck_id, mutate)


@router.post("/merge", response_model=Deck)
def merge_groups(deck_id: str, body: GroupMerge, repo: DeckRepository = Depends(get_repo)) -> Deck:
    if body.source_id == body.target_id:
        raise HTTPException(400, "Choose two different groups to merge")

    def mutate(deck: Deck) -> None:
        source = _require_group(deck, body.source_id)
        _require_group(deck, body.target_id)
        for card in deck.cards:
            if card.group_id == source.id:
                card.group_id = body.target_id
        deck.groups.remove(source)
        _renumber(deck)

    return repo.update(deck_id, mutate)


@router.patch("/{group_id}", response_model=Deck)
def patch_group(
    deck_id: str, group_id: str, body: GroupPatch, repo: DeckRepository = Depends(get_repo)
) -> Deck:
    def mutate(deck: Deck) -> None:
        group = _require_group(deck, group_id)
        if body.name is not None:
            name = normalize_name(body.name)
            _check_name_free(deck, name, ignore_id=group_id)
            group.name = name
        if body.order is not None:
            _renumber(deck)
            deck.groups.remove(group)
            deck.groups.insert(min(body.order, len(deck.groups)), group)
            for index, g in enumerate(deck.groups):
                g.order = index

    return repo.update(deck_id, mutate)


@router.delete("/{group_id}", response_model=Deck)
def delete_group(
    deck_id: str,
    group_id: str,
    move_to: str | None = None,
    delete_cards: bool = False,
    repo: DeckRepository = Depends(get_repo),
) -> Deck:
    def mutate(deck: Deck) -> None:
        group = _require_group(deck, group_id)
        has_cards = any(c.group_id == group_id for c in deck.cards)
        if move_to is not None:
            if move_to == group_id:
                raise HTTPException(400, "Cannot move cards into the group being deleted")
            _require_group(deck, move_to)
            for card in deck.cards:
                if card.group_id == group_id:
                    card.group_id = move_to
        elif delete_cards:
            deck.cards = [c for c in deck.cards if c.group_id != group_id]
        elif has_cards:
            raise HTTPException(
                400,
                "This group has cards. Pass move_to=<group id> to move them, "
                "or delete_cards=true to delete them too.",
            )
        deck.groups.remove(group)
        _renumber(deck)

    return repo.update(deck_id, mutate)
