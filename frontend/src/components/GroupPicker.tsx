import type { Group } from '../lib/types'
import { btnSecondary, panel } from '../lib/ui'

export interface PickerGroup extends Pick<Group, 'id' | 'name'> {
  cardCount: number
}

export default function GroupPicker({
  groups,
  selected,
  onChange,
}: {
  groups: PickerGroup[]
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
}) {
  const total = groups.reduce((sum, g) => sum + (selected.has(g.id) ? g.cardCount : 0), 0)

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            className={btnSecondary}
            onClick={() => onChange(new Set(groups.map((g) => g.id)))}
          >
            Select all
          </button>
          <button type="button" className={btnSecondary} onClick={() => onChange(new Set())}>
            Select none
          </button>
        </div>
        <p className="text-sm font-medium" aria-live="polite" data-testid="selected-total">
          {total} {total === 1 ? 'card' : 'cards'} selected
        </p>
      </div>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.id}>
            <label className={`${panel} flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2`}>
              <input
                type="checkbox"
                className="size-5 accent-indigo-600"
                checked={selected.has(g.id)}
                onChange={() => toggle(g.id)}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {g.cardCount} {g.cardCount === 1 ? 'card' : 'cards'}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
