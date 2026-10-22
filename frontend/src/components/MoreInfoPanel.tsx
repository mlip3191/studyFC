import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { MoreInfo } from '../lib/types'
import { btnGhost, btnSecondary, panel } from '../lib/ui'
import ErrorBanner from './ErrorBanner'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; info: MoreInfo }
  | { status: 'error'; message: string }

/** "Give more information" for one card: a Claude explanation plus clickable source links. */
export default function MoreInfoPanel({ deckId, cardId }: { deckId: string; cardId: string }) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function load() {
    setState({ status: 'loading' })
    try {
      const info = await api.moreInfo(deckId, cardId)
      if (mounted.current) setState({ status: 'done', info })
    } catch (e) {
      if (mounted.current) setState({ status: 'error', message: (e as Error).message })
    }
  }

  return (
    <div data-no-shortcuts className="space-y-3">
      {(state.status === 'idle' || state.status === 'error') && (
        <button type="button" className={btnSecondary} onClick={load}>
          {state.status === 'error' ? 'Try again' : 'Give more information'}
        </button>
      )}

      {state.status === 'loading' && (
        <p
          role="status"
          className={`${panel} px-4 py-3 text-sm text-slate-600 dark:text-slate-300`}
        >
          Searching the web and writing an explanation…
        </p>
      )}

      {state.status === 'error' && <ErrorBanner message={state.message} />}

      {state.status === 'done' && (
        <section className={`${panel} space-y-3 p-4 text-left`} aria-label="More information">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{state.info.explanation}</p>

          {state.info.sources.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Sources</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {state.info.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-words text-indigo-600 underline dark:text-indigo-400"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            AI-generated using web search, and it may go beyond your study guide. Check important
            details against the sources.
          </p>
          <button type="button" className={btnGhost} onClick={() => setState({ status: 'idle' })}>
            Hide
          </button>
        </section>
      )}
    </div>
  )
}
