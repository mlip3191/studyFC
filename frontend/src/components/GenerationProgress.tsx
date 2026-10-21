import { useEffect } from 'react'
import { useJobPolling } from '../hooks/useJobPolling'
import { btnSecondary, panel } from '../lib/ui'
import ErrorBanner from './ErrorBanner'

export default function GenerationProgress({
  jobId,
  onDone,
  onRetry,
  intervalMs,
}: {
  jobId: string
  onDone: (deckId: string) => void
  onRetry: () => void
  intervalMs?: number
}) {
  const { job, error } = useJobPolling(jobId, intervalMs)

  const deckId = job?.status === 'succeeded' ? job.deck_id : null
  useEffect(() => {
    if (deckId) onDone(deckId)
  }, [deckId, onDone])

  const failure = error ?? (job?.status === 'failed' ? (job.error ?? 'Generation failed.') : null)
  if (failure) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={failure} />
        <button type="button" className={btnSecondary} onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  const percent = job && job.total > 0 ? Math.max(5, ((job.current - 1) / job.total) * 100) : 5

  return (
    <div className={`${panel} space-y-3 p-5`} role="status" aria-live="polite">
      <p className="font-medium">
        {job?.status === 'succeeded' ? 'Done! Opening your deck…' : (job?.message ?? 'Starting…')}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Longer documents can take a minute or two. You can leave this page open.
      </p>
    </div>
  )
}
