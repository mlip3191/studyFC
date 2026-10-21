from fastapi import APIRouter, Depends, Response

from app.models import Deck, DeckList
from app.routers.deps import get_repo
from app.routers.schemas import DeckPatch
from app.storage import DeckRepository

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("", response_model=DeckList)
def list_decks(repo: DeckRepository = Depends(get_repo)) -> DeckList:
    return repo.list()


@router.get("/{deck_id}", response_model=Deck)
def get_deck(deck_id: str, repo: DeckRepository = Depends(get_repo)) -> Deck:
    return repo.get(deck_id)


@router.patch("/{deck_id}", response_model=Deck)
def rename_deck(deck_id: str, body: DeckPatch, repo: DeckRepository = Depends(get_repo)) -> Deck:
    def mutate(deck: Deck) -> None:
        deck.title = body.title.strip() or deck.title

    return repo.update(deck_id, mutate)


@router.delete("/{deck_id}", status_code=204)
def delete_deck(deck_id: str, repo: DeckRepository = Depends(get_repo)) -> Response:
    repo.delete(deck_id)
    return Response(status_code=204)
