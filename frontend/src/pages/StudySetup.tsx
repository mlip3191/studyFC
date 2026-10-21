import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ErrorBanner from '../components/ErrorBanner'
import StudySetupForm from '../components/StudySetupForm'
import { api } from '../lib/api'
import type { Deck } from '../lib/types'

export default function StudySetup() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getDeck(deckId)
      .then((d) => !cancelled && setDeck(d))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [deckId])

  const groups = useMemo(
    () =>
      deck
        ? [...deck.groups]
            .sort((a, b) => a.order - b.order)
            .map((g) => ({
              id: g.id,
              name: g.name,
              cardCount: deck.cards.filter((c) => c.group_id === g.id).length,
            }))
        : [],
    [deck],
  )

  if (error) return <ErrorBanner message={error} />
  if (!deck) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-5">
      <Link
        to={`/decks/${deck.id}`}
        className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
      >
        ← {deck.title}
      </Link>
      <h1 className="text-2xl font-bold">Choose what to study</h1>
      <StudySetupForm
        groups={groups}
        hasTermCards={deck.cards.some((c) => c.type === 'term')}
        onStart={(options) => navigate(`/decks/${deck.id}/study/session`, { state: { options } })}
      />
    </div>
  )
}
