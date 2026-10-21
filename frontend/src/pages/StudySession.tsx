import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import ErrorBanner from '../components/ErrorBanner'
import StudyFlow from '../components/StudyFlow'
import { api } from '../lib/api'
import { buildQueue, type StudyCard, type StudyOptions } from '../lib/study'

export default function StudySession() {
  const { deckId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const options = (location.state as { options?: StudyOptions } | null)?.options

  const [queue, setQueue] = useState<StudyCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!options) return
    let cancelled = false
    api
      .getDeck(deckId)
      .then((deck) => !cancelled && setQueue(buildQueue(deck, options)))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
    // The queue is built once per visit: later edits must not reshuffle a running session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  // Opened directly (e.g. page refresh): there is no session to resume.
  if (!options) return <Navigate to={`/decks/${deckId}/study`} replace />
  if (error) return <ErrorBanner message={error} />
  if (!queue) return <p className="text-slate-500">Loading…</p>

  return (
    <StudyFlow
      initialQueue={queue}
      shuffle={options.shuffle}
      onExit={() => navigate(`/decks/${deckId}`)}
    />
  )
}
