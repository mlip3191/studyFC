import type { Summary } from '../lib/study'
import { btnPrimary, btnSecondary, panel } from '../lib/ui'

const pct = (got: number, total: number) => (total === 0 ? 0 : Math.round((got / total) * 100))

export default function ResultsView({
  summary,
  onReviewMissed,
  onBack,
}: {
  summary: Summary
  onReviewMissed: () => void
  onBack: () => void
}) {
  const { total, got, missed, perGroup, missedCards } = summary

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Session results</h1>

      <div className={`${panel} p-5 text-center`}>
        {total === 0 ? (
          <p className="text-slate-500">No cards were answered.</p>
        ) : (
          <>
            <p className="text-4xl font-bold" data-testid="score">
              {got} / {total}
            </p>
            <p className="text-slate-500 dark:text-slate-400">{pct(got, total)}% correct</p>
          </>
        )}
      </div>

      {perGroup.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">By group</h2>
          <ul className="space-y-2">
            {perGroup.map((g) => (
              <li
                key={g.groupId}
                className={`${panel} flex items-center justify-between px-4 py-3`}
              >
                <span className="truncate">{g.groupName}</span>
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {g.got} / {g.total} ({pct(g.got, g.total)}%)
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {missed > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Missed cards ({missed})</h2>
          <ul className="space-y-2">
            {missedCards.map((c) => (
              <li key={c.id} className={`${panel} space-y-1 px-4 py-3`}>
                <p className="font-medium">{c.prompt}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{c.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {missed > 0 && (
          <button type="button" className={btnPrimary} onClick={onReviewMissed}>
            Review missed cards ({missed})
          </button>
        )}
        <button type="button" className={btnSecondary} onClick={onBack}>
          Back to deck
        </button>
      </div>
    </div>
  )
}
