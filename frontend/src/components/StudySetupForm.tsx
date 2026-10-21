import { useState } from 'react'
import type { Direction, StudyOptions } from '../lib/study'
import { btnPrimary, panel } from '../lib/ui'
import GroupPicker, { type PickerGroup } from './GroupPicker'

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'term-to-def', label: 'Term → definition' },
  { value: 'def-to-term', label: 'Definition → term' },
  { value: 'mixed', label: 'Mixed' },
]

export default function StudySetupForm({
  groups,
  hasTermCards,
  onStart,
}: {
  groups: PickerGroup[]
  hasTermCards: boolean
  onStart: (options: StudyOptions) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.cardCount > 0).map((g) => g.id)),
  )
  const [shuffle, setShuffle] = useState(true)
  const [direction, setDirection] = useState<Direction>('term-to-def')

  const total = groups.reduce((sum, g) => sum + (selected.has(g.id) ? g.cardCount : 0), 0)

  return (
    <div className="space-y-5">
      <GroupPicker groups={groups} selected={selected} onChange={setSelected} />

      <div className={`${panel} space-y-4 p-4`}>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-indigo-600"
            checked={shuffle}
            onChange={(e) => setShuffle(e.target.checked)}
          />
          Shuffle cards
        </label>

        {hasTermCards && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Term cards</legend>
            <div className="flex flex-wrap gap-2">
              {DIRECTIONS.map((d) => (
                <label
                  key={d.value}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                    direction === d.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="direction"
                    value={d.value}
                    checked={direction === d.value}
                    onChange={() => setDirection(d.value)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <button
        type="button"
        className={`${btnPrimary} w-full`}
        disabled={total === 0}
        onClick={() => onStart({ groupIds: [...selected], shuffle, direction })}
      >
        Start studying{total > 0 ? ` (${total})` : ''}
      </button>
    </div>
  )
}
