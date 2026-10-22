import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { StudyCard } from '../lib/study'
import MoreInfoPanel from './MoreInfoPanel'
import StudyFlow from './StudyFlow'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, api: { ...actual.api, moreInfo: vi.fn() } }
})

const moreInfo = vi.mocked(api.moreInfo)

beforeEach(() => {
  vi.clearAllMocks()
})

const INFO = {
  explanation: 'The Sharpe ratio measures excess return per unit of risk.',
  sources: [
    { title: 'Sharpe ratio - Reference', url: 'https://ref.example/sharpe' },
    { title: 'Second source', url: 'https://second.example/page' },
  ],
}

describe('MoreInfoPanel', () => {
  it('shows only the button until clicked', () => {
    render(<MoreInfoPanel deckId="d1" cardId="c1" />)
    expect(screen.getByRole('button', { name: 'Give more information' })).toBeInTheDocument()
    expect(moreInfo).not.toHaveBeenCalled()
  })

  it('loads an explanation with clickable source links that open in a new tab', async () => {
    moreInfo.mockResolvedValue(INFO)
    const user = userEvent.setup()
    render(<MoreInfoPanel deckId="d1" cardId="c1" />)
    await user.click(screen.getByRole('button', { name: 'Give more information' }))

    expect(await screen.findByText(INFO.explanation)).toBeInTheDocument()
    expect(moreInfo).toHaveBeenCalledWith('d1', 'c1')
    const link = screen.getByRole('link', { name: 'Sharpe ratio - Reference' })
    expect(link).toHaveAttribute('href', 'https://ref.example/sharpe')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByText(/AI-generated/)).toBeInTheDocument()
  })

  it('shows a loading state, and Hide returns to the button', async () => {
    let resolve!: (v: typeof INFO) => void
    moreInfo.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = userEvent.setup()
    render(<MoreInfoPanel deckId="d1" cardId="c1" />)
    await user.click(screen.getByRole('button', { name: 'Give more information' }))
    expect(screen.getByRole('status')).toHaveTextContent('Searching the web')
    resolve(INFO)
    await screen.findByText(INFO.explanation)
    await user.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.getByRole('button', { name: 'Give more information' })).toBeInTheDocument()
  })

  it('works without sources', async () => {
    moreInfo.mockResolvedValue({ explanation: 'Just text.', sources: [] })
    const user = userEvent.setup()
    render(<MoreInfoPanel deckId="d1" cardId="c1" />)
    await user.click(screen.getByRole('button'))
    expect(await screen.findByText('Just text.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText('Sources')).not.toBeInTheDocument()
  })

  it('shows the error and lets you retry', async () => {
    moreInfo.mockRejectedValueOnce(new Error('No Anthropic API key is configured.'))
    moreInfo.mockResolvedValueOnce(INFO)
    const user = userEvent.setup()
    render(<MoreInfoPanel deckId="d1" cardId="c1" />)
    await user.click(screen.getByRole('button', { name: 'Give more information' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No Anthropic API key')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(INFO.explanation)).toBeInTheDocument()
  })
})

describe('in a study session', () => {
  const queue: StudyCard[] = [1, 2].map((n) => ({
    id: `c${n}`,
    groupId: 'g1',
    groupName: 'Alpha',
    prompt: `Question ${n}`,
    answer: `Answer ${n}`,
  }))

  it('asks about the current card, and shortcuts are ignored inside the panel', async () => {
    moreInfo.mockResolvedValue(INFO)
    const user = userEvent.setup()
    render(<StudyFlow deckId="deck1" initialQueue={queue} shuffle={false} onExit={vi.fn()} />)

    await user.click(screen.getByTestId('flashcard')) // flip to the answer
    const button = screen.getByRole('button', { name: 'Give more information' })
    await user.click(button)
    expect(moreInfo).toHaveBeenCalledWith('deck1', 'c1')
    await screen.findByText(INFO.explanation)

    // Keys pressed while focus is in the panel must not mark the card.
    screen.getByRole('button', { name: 'Hide' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument()

    // After moving to the next card, the panel starts fresh for that card.
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument()
    expect(screen.queryByText(INFO.explanation)).not.toBeInTheDocument()
    await user.click(screen.getByTestId('flashcard'))
    await user.click(screen.getByRole('button', { name: 'Give more information' }))
    expect(moreInfo).toHaveBeenLastCalledWith('deck1', 'c2')
  })
})
