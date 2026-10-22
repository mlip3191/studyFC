from fastapi import APIRouter, Depends, HTTPException, Request

from app.llm.client import GenerationError, MissingApiKeyError
from app.llm.more_info import MoreInfo
from app.models import Card, Deck, new_id, now
from app.routers.deps import get_repo
from app.routers.schemas import CardCreate, CardPatch
from app.storage import DeckRepository

router = APIRouter(prefix="/decks/{deck_id}/cards", tags=["cards"])


def _require_card(deck: Deck, card_id: str) -> Card:
    card = deck.card_by_id(card_id)
    if card is None:
        raise HTTPException(404, f"Card '{card_id}' not found")
    return card


def _require_group(deck: Deck, group_id: str) -> None:
    if deck.group_by_id(group_id) is None:
        raise HTTPException(404, f"Group '{group_id}' not found")


@router.post("", response_model=Deck, status_code=201)
def create_card(deck_id: str, body: CardCreate, repo: DeckRepository = Depends(get_repo)) -> Deck:
    def mutate(deck: Deck) -> None:
        _require_group(deck, body.group_id)
        deck.cards.append(
            Card(
                id=new_id(deck.all_ids()),
                group_id=body.group_id,
                type=body.type,
                front=body.front.strip(),
                back=body.back.strip(),
            )
        )

    return repo.update(deck_id, mutate)


@router.patch("/{card_id}", response_model=Deck)
def patch_card(
    deck_id: str, card_id: str, body: CardPatch, repo: DeckRepository = Depends(get_repo)
) -> Deck:
    def mutate(deck: Deck) -> None:
        card = _require_card(deck, card_id)
        if body.group_id is not None:
            _require_group(deck, body.group_id)
            card.group_id = body.group_id
        if body.front is not None:
            card.front = body.front.strip()
        if body.back is not None:
            card.back = body.back.strip()
        if body.type is not None:
            card.type = body.type
        if not card.front or not card.back:
            raise HTTPException(422, "Front and back cannot be empty")
        card.updated_at = now()

    return repo.update(deck_id, mutate)


@router.delete("/{card_id}", response_model=Deck)
def delete_card(deck_id: str, card_id: str, repo: DeckRepository = Depends(get_repo)) -> Deck:
    def mutate(deck: Deck) -> None:
        deck.cards.remove(_require_card(deck, card_id))

    return repo.update(deck_id, mutate)


@router.post("/{card_id}/more-info", response_model=MoreInfo)
def more_info(
    deck_id: str, card_id: str, request: Request, repo: DeckRepository = Depends(get_repo)
) -> MoreInfo:
    """Ask Claude (with web search) to explain a card in more depth, with source links."""
    deck = repo.get(deck_id)
    card = _require_card(deck, card_id)
    group = deck.group_by_id(card.group_id)
    try:
        client = request.app.state.generator_factory()
        return client.explain(
            deck_title=deck.title,
            group_name=group.name if group else "",
            card_type=card.type,
            front=card.front,
            back=card.back,
        )
    except MissingApiKeyError as exc:
        raise HTTPException(400, str(exc)) from exc
    except GenerationError as exc:
        raise HTTPException(502, str(exc)) from exc
