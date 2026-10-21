import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { Job } from '../lib/types'
import GenerationProgress from './GenerationProgress'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, api: { ...actual.api, getJob: vi.fn() } }
})

const getJob = vi.mocked(api.getJob)

const job = (over: Partial<Job>): Job => ({
  id: 'j1',
  status: 'running',
  current: 0,
  total: 0,
  message: 'Queued',
  deck_id: null,
  error: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GenerationProgress', () => {
  it('polls and shows section progress, then reports the new deck', async () => {
    getJob
      .mockResolvedValueOnce(job({ current: 2, total: 5, message: 'Processing section 2 of 5' }))
      .mockResolvedValueOnce(job({ status: 'succeeded', message: 'Done', deck_id: 'deck42' }))
    const onDone = vi.fn()
    render(<GenerationProgress jobId="j1" onDone={onDone} onRetry={vi.fn()} intervalMs={10} />)

    expect(await screen.findByText('Processing section 2 of 5')).toBeInTheDocument()
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('deck42'))
    expect(getJob).toHaveBeenCalledTimes(2)
    expect(getJob).toHaveBeenCalledWith('j1')
  })

  it('shows the job error and offers to try again', async () => {
    getJob.mockResolvedValue(job({ status: 'failed', error: 'Rate limited by Anthropic.' }))
    const onRetry = vi.fn()
    const onDone = vi.fn()
    render(<GenerationProgress jobId="j1" onDone={onDone} onRetry={onRetry} intervalMs={10} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Rate limited by Anthropic.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onDone).not.toHaveBeenCalled()
    expect(getJob).toHaveBeenCalledTimes(1) // polling stops once failed
  })

  it('gives up with a message after repeated network failures', async () => {
    getJob.mockImplementation(async () => {
      throw new Error('Could not reach the server.')
    })
    render(<GenerationProgress jobId="j1" onDone={vi.fn()} onRetry={vi.fn()} intervalMs={5} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    expect(getJob).toHaveBeenCalledTimes(3)
  })
})
