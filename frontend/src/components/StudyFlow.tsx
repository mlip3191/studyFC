import { useCallback, useState } from 'react'
import {
  buildReviewQueue,
  summarize,
  type Answer,
  type StudyCard,
  type Summary,
} from '../lib/study'
import ResultsView from './ResultsView'
import SessionView from './SessionView'

type Phase =
  | { name: 'session'; round: number; queue: StudyCard[] }
  | { name: 'results'; round: number; summary: Summary }

/**
 * Runs a study session and its results screen. "Review missed" starts a new session with only
 * the missed cards, and can be repeated until nothing is missed. All state is in memory.
 */
export default function StudyFlow({
  initialQueue,
  shuffle,
  onExit,
}: {
  initialQueue: StudyCard[]
  shuffle: boolean
  onExit: () => void
}) {
  const [phase, setPhase] = useState<Phase>({ name: 'session', round: 0, queue: initialQueue })

  const finish = useCallback((answers: Answer[]) => {
    setPhase((prev) => ({ name: 'results', round: prev.round, summary: summarize(answers) }))
  }, [])

  if (phase.name === 'session') {
    if (phase.queue.length === 0) {
      return <ResultsView summary={summarize([])} onReviewMissed={onExit} onBack={onExit} />
    }
    // `key` gives every round a fresh SessionView (and so a fresh session state).
    return <SessionView key={phase.round} queue={phase.queue} onFinish={finish} />
  }

  return (
    <ResultsView
      summary={phase.summary}
      onBack={onExit}
      onReviewMissed={() =>
        setPhase({
          name: 'session',
          round: phase.round + 1,
          queue: buildReviewQueue(phase.summary.missedCards, shuffle),
        })
      }
    />
  )
}
