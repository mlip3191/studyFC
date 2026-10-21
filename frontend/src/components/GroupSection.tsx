import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { Card, Deck, Group } from '../lib/types'
import { btnDanger, btnPrimary, btnSecondary, input, panel } from '../lib/ui'
import CardEditor from './CardEditor'
import { Modal } from './Modal'
import NewCardForm from './NewCardForm'
import type { RunFn } from './runTypes'

type Dialog = null | 'merge' | 'delete'

export default function GroupSection({
  deckId,
  group,
  index,
  groups,
  cards,
  run,
}: {
  deckId: string
  group: Group
  index: number
  groups: Group[]
  cards: Card[]
  run: RunFn<Deck>
}) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group.name)
  const [adding, setAdding] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)

  const others = groups.filter((g) => g.id !== group.id)

  async function submitRename(e: FormEvent) {
    e.preventDefault()
    const next = name.trim()
    if (!next || next === group.name) {
      setName(group.name)
      setRenaming(false)
      return
    }
    if (await run(() => api.patchGroup(deckId, group.id, { name: next }))) setRenaming(false)
  }

  return (
    <section className={panel} aria-label={group.name}>
      <button
        type="button"
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{group.name}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {cards.length} {cards.length === 1 ? 'card' : 'cards'}
          </span>
        </span>
        <span aria-hidden className="text-slate-400">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
          {renaming ? (
            <form onSubmit={submitRename} className="flex gap-2">
              <input
                className={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Group name"
                autoFocus
              />
              <button type="submit" className={btnPrimary}>
                Save
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  setName(group.name)
                  setRenaming(false)
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} onClick={() => setRenaming(true)}>
                Rename
              </button>
              <button
                type="button"
                className={btnSecondary}
                disabled={index === 0}
                onClick={() => run(() => api.patchGroup(deckId, group.id, { order: index - 1 }))}
                aria-label={`Move ${group.name} up`}
              >
                ↑ Up
              </button>
              <button
                type="button"
                className={btnSecondary}
                disabled={index === groups.length - 1}
                onClick={() => run(() => api.patchGroup(deckId, group.id, { order: index + 1 }))}
                aria-label={`Move ${group.name} down`}
              >
                ↓ Down
              </button>
              <button
                type="button"
                className={btnSecondary}
                disabled={others.length === 0}
                onClick={() => setDialog('merge')}
              >
                Merge into…
              </button>
              <button type="button" className={btnDanger} onClick={() => setDialog('delete')}>
                Delete group
              </button>
            </div>
          )}

          <ul className="space-y-3">
            {cards.map((card) => (
              <CardEditor key={card.id} deckId={deckId} card={card} groups={groups} run={run} />
            ))}
          </ul>

          {adding ? (
            <NewCardForm
              deckId={deckId}
              groupId={group.id}
              run={run}
              onDone={() => setAdding(false)}
            />
          ) : (
            <button type="button" className={btnSecondary} onClick={() => setAdding(true)}>
              + Add card
            </button>
          )}
        </div>
      )}

      {dialog === 'merge' && (
        <MergeDialog
          group={group}
          others={others}
          onCancel={() => setDialog(null)}
          onConfirm={async (targetId) => {
            setDialog(null)
            await run(() => api.mergeGroups(deckId, group.id, targetId))
          }}
        />
      )}
      {dialog === 'delete' && (
        <DeleteDialog
          group={group}
          cardCount={cards.length}
          others={others}
          onCancel={() => setDialog(null)}
          onConfirm={async (opts) => {
            setDialog(null)
            await run(() => api.deleteGroup(deckId, group.id, opts))
          }}
        />
      )}
    </section>
  )
}

function MergeDialog({
  group,
  others,
  onCancel,
  onConfirm,
}: {
  group: Group
  others: Group[]
  onCancel: () => void
  onConfirm: (targetId: string) => void
}) {
  const [target, setTarget] = useState(others[0]?.id ?? '')
  return (
    <Modal title={`Merge “${group.name}”`} onClose={onCancel}>
      <label className="block text-sm">
        Move all its cards into
        <select
          className={`${input} mt-1`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {others.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-slate-500">“{group.name}” will be removed.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={!target}
          onClick={() => onConfirm(target)}
        >
          Merge
        </button>
      </div>
    </Modal>
  )
}

function DeleteDialog({
  group,
  cardCount,
  others,
  onCancel,
  onConfirm,
}: {
  group: Group
  cardCount: number
  others: Group[]
  onCancel: () => void
  onConfirm: (opts: { moveTo?: string; deleteCards?: boolean }) => void
}) {
  const canMove = cardCount > 0 && others.length > 0
  const [mode, setMode] = useState<'move' | 'delete'>(canMove ? 'move' : 'delete')
  const [target, setTarget] = useState(others[0]?.id ?? '')

  return (
    <Modal title={`Delete “${group.name}”?`} onClose={onCancel}>
      {cardCount === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">This group has no cards.</p>
      ) : (
        <fieldset className="space-y-3 text-sm">
          <legend className="mb-2 text-slate-600 dark:text-slate-300">
            This group has {cardCount} {cardCount === 1 ? 'card' : 'cards'}. What should happen to
            them?
          </legend>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="mode"
              checked={mode === 'move'}
              disabled={!canMove}
              onChange={() => setMode('move')}
            />
            Move them to
            <select
              className={`${input} flex-1`}
              value={target}
              disabled={mode !== 'move'}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="Target group"
            >
              {others.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="mode"
              checked={mode === 'delete'}
              onChange={() => setMode('delete')}
            />
            Delete the cards too
          </label>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={btnDanger}
          onClick={() =>
            onConfirm(mode === 'move' && cardCount > 0 ? { moveTo: target } : { deleteCards: true })
          }
        >
          Delete group
        </button>
      </div>
    </Modal>
  )
}
