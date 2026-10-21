import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import type { Job } from '../lib/types'

const MAX_CONSECUTIVE_FAILURES = 3

/** Polls GET /api/jobs/{id} until the job succeeds or fails. */
export function useJobPolling(jobId: string, intervalMs = 1000) {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0

    const tick = async () => {
      try {
        const next = await api.getJob(jobId)
        if (cancelled) return
        failures = 0
        setJob(next)
        if (next.status === 'succeeded' || next.status === 'failed') return
      } catch (e) {
        if (cancelled) return
        failures += 1
        const gone = e instanceof ApiError && e.status === 404
        if (gone || failures >= MAX_CONSECUTIVE_FAILURES) {
          setError((e as Error).message)
          return
        }
      }
      timer = setTimeout(tick, intervalMs)
    }
    void tick()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [jobId, intervalMs])

  return { job, error }
}
