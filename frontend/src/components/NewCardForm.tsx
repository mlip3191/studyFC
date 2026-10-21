import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { CardType, Deck } from '../lib/types'
import { btnPrimary, btnSecondary, input } from '../lib/ui'
import type { RunFn } from './runTypes'

export default function NewCardForm({
  deckId,
  groupId,
  run,
  onDone,
}: {
  deckId: string
  groupId: string
  run: RunFn<Deck>
  onDone: () => void
}) {
  const [type, setType] = useState<CardType>('qa')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!front.trim() || !back.trim()) return
    const ok = await run(() =>
      api.createCard(deckId, { group_id: groupId, type, front: front.trim(), back: back.trim() }),
    )
    if (ok) onDone()
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-lg border border-dashed border-indigo-400 p-3"
      aria-label="New card"
    >
      <select
        aria-label="New card type"
        className={input}
        value={type}
        onChange={(e) => setType(e.target.value as CardType)}
      >
        <option value="qa">Question / answer</option>
        <option value="term">Term / definition</option>
      </select>
      <input
        className={input}
        placeholder={type === 'term' ? 'Term' : 'Question'}
        value={front}
        onChange={(e) => setFront(e.target.value)}
        autoFocus
      />
      <textarea
        className={`${input} field-sizing-content resize-y`}
        placeholder={type === 'term' ? 'Definition' : 'Answer'}
        value={back}
        onChange={(e) => setBack(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={btnPrimary} disabled={!front.trim() || !back.trim()}>
          Add card
        </button>
      </div>
    </form>
  )
}
