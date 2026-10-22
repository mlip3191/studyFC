import { useState } from 'react'
import { api } from '../lib/api'
import type { Card, CardType, Deck, Group } from '../lib/types'
import { btnGhost, input } from '../lib/ui'
import MoreInfoPanel from './MoreInfoPanel'
import type { RunFn } from './runTypes'

const TYPE_LABEL: Record<CardType, string> = { qa: 'Question / answer', term: 'Term / definition' }

const area = `${input} field-sizing-content min-h-11 resize-y`

export default function CardEditor({
  deckId,
  card,
  groups,
  run,
}: {
  deckId: string
  card: Card
  groups: Group[]
  run: RunFn<Deck>
}) {
  const [front, setFront] = useState(card.front)
  const [back, setBack] = useState(card.back)

  const frontLabel = card.type === 'term' ? 'Term' : 'Question'
  const backLabel = card.type === 'term' ? 'Definition' : 'Answer'

  async function saveText(field: 'front' | 'back') {
    const value = (field === 'front' ? front : back).trim()
    if (!value) {
      // Empty text is not allowed: revert to the saved value.
      if (field === 'front') setFront(card.front)
      else setBack(card.back)
      return
    }
    if (value === card[field]) return
    await run(() => api.patchCard(deckId, card.id, { [field]: value }))
  }

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Card type"
          className={`${input} w-auto flex-1`}
          value={card.type}
          onChange={(e) =>
            run(() => api.patchCard(deckId, card.id, { type: e.target.value as CardType }))
          }
        >
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Move card to group"
          className={`${input} w-auto flex-1`}
          value={card.group_id}
          onChange={(e) => run(() => api.patchCard(deckId, card.id, { group_id: e.target.value }))}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {frontLabel}
        <textarea
          className={area}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          onBlur={() => saveText('front')}
        />
      </label>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {backLabel}
        <textarea
          className={area}
          value={back}
          onChange={(e) => setBack(e.target.value)}
          onBlur={() => saveText('back')}
        />
      </label>
      <MoreInfoPanel deckId={deckId} cardId={card.id} />
      <div className="flex justify-end">
        <button
          type="button"
          className={`${btnGhost} text-red-600 dark:text-red-400`}
          onClick={() => run(() => api.deleteCard(deckId, card.id))}
        >
          Delete card
        </button>
      </div>
    </li>
  )
}
