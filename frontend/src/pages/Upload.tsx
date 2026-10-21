import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ErrorBanner from '../components/ErrorBanner'
import GenerationProgress from '../components/GenerationProgress'
import UploadForm from '../components/UploadForm'
import { api } from '../lib/api'
import type { AppConfig, GenerateInput } from '../lib/types'

export default function Upload() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .config()
      .then((c) => !cancelled && setConfig(c))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  async function start(input: GenerateInput) {
    setSubmitting(true)
    setError(null)
    try {
      const { job_id } = await api.generate(input)
      setJobId(job_id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const onDone = useCallback((deckId: string) => navigate(`/decks/${deckId}`), [navigate])

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
        ← All decks
      </Link>
      <h1 className="text-2xl font-bold">New deck</h1>

      {config && !config.api_key_configured && (
        <ErrorBanner message="No Anthropic API key is configured, so flashcards can't be generated. Set ANTHROPIC_API_KEY in your .env file and restart. You can still browse and study existing decks." />
      )}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {jobId ? (
        <GenerationProgress jobId={jobId} onDone={onDone} onRetry={() => setJobId(null)} />
      ) : config ? (
        <UploadForm
          supportedExtensions={config.supported_extensions}
          maxUploadMb={config.max_upload_mb}
          disabled={submitting || !config.api_key_configured}
          onSubmit={start}
        />
      ) : (
        !error && <p className="text-slate-500">Loading…</p>
      )}
    </div>
  )
}
