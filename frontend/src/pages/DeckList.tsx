import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/Modal'
import ErrorBanner from '../components/ErrorBanner'
import { api } from '../lib/api'
import type { DeckList, DeckSummary } from '../lib/types'
import { btnGhost, btnPrimary, panel } from '../lib/ui'

export default function DeckListPage() {
  const [data, setData] = useState<DeckList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<DeckSummary | null>(null)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    api
      .listDecks()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  async function confirmDelete() {
    if (!toDelete) return
    const id = toDelete.id
    setToDelete(null)
    try {
      await api.deleteDeck(id)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Your decks</h1>
        <Link to="/new" className={btnPrimary}>
          New deck
        </Link>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {!data && !error && <p className="text-slate-500">Loading…</p>}

      {data && data.decks.length === 0 && data.errors.length === 0 && (
        <p className={`${panel} p-6 text-center text-slate-500`}>
          No decks yet. Create one from a study guide.
        </p>
      )}

      <ul className="space-y-3">
        {data?.decks.map((deck) => (
          <li key={deck.id} className={`${panel} flex items-center gap-2 p-2 pl-4`}>
            <Link to={`/decks/${deck.id}`} className="min-w-0 flex-1 py-2">
              <div className="truncate font-semibold">{deck.title}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {deck.card_count} {deck.card_count === 1 ? 'card' : 'cards'} · {deck.group_count}{' '}
                {deck.group_count === 1 ? 'group' : 'groups'}
              </div>
            </Link>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setToDelete(deck)}
              aria-label={`Delete ${deck.title}`}
            >
              Delete
            </button>
          </li>
        ))}
        {data?.errors.map((err) => (
          <li
            key={err.filename}
            className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <div className="font-semibold">Could not load {err.filename}</div>
            <div className="mt-1 break-words">{err.error}</div>
          </li>
        ))}
      </ul>

      {toDelete && (
        <ConfirmDialog
          title="Delete deck?"
          message={`“${toDelete.title}” and its ${toDelete.card_count} cards will be permanently deleted.`}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
