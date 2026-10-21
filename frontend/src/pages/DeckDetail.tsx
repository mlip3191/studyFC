import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import ErrorBanner from '../components/ErrorBanner'
import GroupSection from '../components/GroupSection'
import { api } from '../lib/api'
import type { Deck } from '../lib/types'
import { btnPrimary, btnSecondary, input } from '../lib/ui'

export default function DeckDetail() {
  const { deckId = '' } = useParams()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [newGroup, setNewGroup] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .getDeck(deckId)
      .then((d) => {
        if (cancelled) return
        setDeck(d)
        setTitle(d.title)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [deckId])

  /** Runs a mutation, replaces the deck with the server's response, and reports errors. */
  const run = useCallback(async (op: () => Promise<Deck>) => {
    try {
      setDeck(await op())
      setError(null)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }, [])

  const groups = useMemo(
    () => (deck ? [...deck.groups].sort((a, b) => a.order - b.order) : []),
    [deck],
  )

  if (!deck) {
    return error ? (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <Link to="/" className={btnSecondary}>
          Back to decks
        </Link>
      </div>
    ) : (
      <p className="text-slate-500">Loading…</p>
    )
  }

  async function saveTitle() {
    const next = title.trim()
    if (!deck) return
    if (!next) return setTitle(deck.title)
    if (next !== deck.title) await run(() => api.renameDeck(deck.id, next))
  }

  async function addGroup(e: FormEvent) {
    e.preventDefault()
    const name = newGroup.trim()
    if (!name || !deck) return
    if (await run(() => api.createGroup(deck.id, name))) setNewGroup('')
  }

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
        ← All decks
      </Link>

      <div className="space-y-3">
        <input
          aria-label="Deck title"
          className={`${input} text-xl font-bold`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {deck.cards.length} cards · {deck.groups.length} groups
            {deck.source ? ` · from ${deck.source.filename}` : ''}
          </p>
          {deck.cards.length > 0 ? (
            <Link to={`/decks/${deck.id}/study`} className={btnPrimary}>
              Study
            </Link>
          ) : (
            <button type="button" className={btnPrimary} disabled>
              Study
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="space-y-3">
        {groups.map((group, index) => (
          <GroupSection
            key={group.id}
            deckId={deck.id}
            group={group}
            index={index}
            groups={groups}
            cards={deck.cards.filter((c) => c.group_id === group.id)}
            run={run}
          />
        ))}
        {groups.length === 0 && (
          <p className="text-slate-500">This deck has no groups yet. Add one below.</p>
        )}
      </div>

      <form onSubmit={addGroup} className="flex gap-2" aria-label="Add group">
        <input
          className={input}
          placeholder="New group name"
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
        />
        <button type="submit" className={btnSecondary} disabled={!newGroup.trim()}>
          Add group
        </button>
      </form>
    </div>
  )
}
