import { useCallback, useState } from 'react'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import {
  initSession,
  isFinished,
  sessionReducer,
  type Answer,
  type SessionAction,
  type StudyCard,
} from '../lib/study'
import { btnDanger, btnGhost, btnPrimary, panel } from '../lib/ui'
import MoreInfoPanel from './MoreInfoPanel'

export default function SessionView({
  deckId,
  queue,
  onFinish,
}: {
  deckId: string
  queue: StudyCard[]
  /** Called once, with the answers so far, when the queue runs out or the user ends early. */
  onFinish: (answers: Answer[]) => void
}) {
  const [state, setState] = useState(() => initSession(queue))

  const dispatch = useCallback(
    (action: SessionAction) => {
      const next = sessionReducer(state, action)
      if (next === state) return
      setState(next)
      if (isFinished(next)) onFinish(next.answers)
    },
    [state, onFinish],
  )

  const flip = useCallback(() => dispatch({ type: 'flip' }), [dispatch])
  const gotIt = useCallback(() => dispatch({ type: 'mark', result: 'got' }), [dispatch])
  const missed = useCallback(() => dispatch({ type: 'mark', result: 'missed' }), [dispatch])
  const end = useCallback(() => dispatch({ type: 'end' }), [dispatch])

  useKeyboardShortcuts({ onFlip: flip, onGotIt: gotIt, onMissed: missed, onEnd: end })

  const card = state.queue[Math.min(state.index, state.queue.length - 1)]
  const position = Math.min(state.index + 1, state.queue.length)
  const percent = (state.index / state.queue.length) * 100

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>
            Card {position} of {state.queue.length}
          </span>
          <button type="button" className={btnGhost} onClick={end}>
            End session
          </button>
        </div>
        <div
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={state.queue.length}
          aria-valuenow={state.index}
          className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        >
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <button
        type="button"
        onClick={flip}
        data-testid="flashcard"
        aria-label={
          state.flipped ? 'Answer. Click to show the question.' : 'Question. Click to flip.'
        }
        className={`${panel} flex min-h-72 w-full flex-col items-center justify-center gap-3 p-6 text-center transition-colors ${
          state.flipped ? 'bg-indigo-50 dark:bg-indigo-950' : ''
        }`}
      >
        <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {card.groupName}
        </span>
        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
          {state.flipped ? 'Answer' : 'Question'}
        </span>
        <span className="whitespace-pre-wrap break-words text-xl font-medium sm:text-2xl">
          {state.flipped ? card.answer : card.prompt}
        </span>
        {!state.flipped && <span className="text-sm text-slate-400">Tap to reveal the answer</span>}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={`${btnDanger} min-h-14 text-base`} onClick={missed}>
          Missed
        </button>
        <button type="button" className={`${btnPrimary} min-h-14 text-base`} onClick={gotIt}>
          Got it
        </button>
      </div>

      {/* Kept mounted (just hidden) so a loaded explanation survives un-flipping the card. */}
      <div className={state.flipped ? '' : 'hidden'}>
        <MoreInfoPanel key={card.id} deckId={deckId} cardId={card.id} />
      </div>

      <p className="hidden text-center text-sm text-slate-500 md:block">
        <kbd>Space</kbd> flip · <kbd>→</kbd>/<kbd>K</kbd> got it · <kbd>←</kbd>/<kbd>J</kbd> missed
        · <kbd>Esc</kbd> end
      </p>
    </div>
  )
}
