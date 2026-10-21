import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StudyCard } from '../lib/study'
import StudyFlow from './StudyFlow'

function makeQueue(n: number): StudyCard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    groupId: i % 2 === 0 ? 'g1' : 'g2',
    groupName: i % 2 === 0 ? 'Alpha' : 'Beta',
    prompt: `Question ${i + 1}`,
    answer: `Answer ${i + 1}`,
  }))
}

function setup(n = 4, shuffle = false) {
  const onExit = vi.fn()
  const user = userEvent.setup()
  render(<StudyFlow initialQueue={makeQueue(n)} shuffle={shuffle} onExit={onExit} />)
  return { user, onExit }
}

const card = () => screen.getByTestId('flashcard')

describe('study session', () => {
  it('shows the question, group name and progress', () => {
    setup()
    expect(card()).toHaveTextContent('Question 1')
    expect(card()).toHaveTextContent('Alpha')
    expect(screen.getByText('Card 1 of 4')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('flips on click and flips back', async () => {
    const { user } = setup()
    await user.click(card())
    expect(card()).toHaveTextContent('Answer 1')
    await user.click(card())
    expect(card()).toHaveTextContent('Question 1')
  })

  it('Got it / Missed advance to an unflipped next card', async () => {
    const { user } = setup()
    await user.click(card())
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.getByText('Card 2 of 4')).toBeInTheDocument()
    expect(card()).toHaveTextContent('Question 2')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await user.click(screen.getByRole('button', { name: 'Missed' }))
    expect(screen.getByText('Card 3 of 4')).toBeInTheDocument()
  })

  it('finishing shows score, per-group results and missed cards', async () => {
    const { user } = setup(3)
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await user.click(screen.getByRole('button', { name: 'Missed' }))
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.getByTestId('score')).toHaveTextContent('2 / 3')
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('2 / 2 (100%)')).toBeInTheDocument() // Alpha: cards 1 and 3
    expect(screen.getByText('0 / 1 (0%)')).toBeInTheDocument() // Beta: card 2
    expect(screen.getByText('Missed cards (1)')).toBeInTheDocument()
    expect(screen.getByText('Question 2')).toBeInTheDocument()
  })

  it('review-missed loops until nothing is missed', async () => {
    const { user, onExit } = setup(4)
    // Round 1: miss cards 2 and 3.
    for (const btn of ['Got it', 'Missed', 'Missed', 'Got it']) {
      await user.click(screen.getByRole('button', { name: btn }))
    }
    expect(screen.getByTestId('score')).toHaveTextContent('2 / 4')

    // Round 2: only the 2 missed cards; miss one again.
    await user.click(screen.getByRole('button', { name: 'Review missed cards (2)' }))
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument()
    expect(card()).toHaveTextContent('Question 2')
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await user.click(screen.getByRole('button', { name: 'Missed' }))
    expect(screen.getByTestId('score')).toHaveTextContent('1 / 2')

    // Round 3: just the one card left.
    await user.click(screen.getByRole('button', { name: 'Review missed cards (1)' }))
    expect(screen.getByText('Card 1 of 1')).toBeInTheDocument()
    expect(card()).toHaveTextContent('Question 3')
    await user.click(screen.getByRole('button', { name: 'Got it' }))

    // Nothing missed: no more review button.
    expect(screen.getByTestId('score')).toHaveTextContent('1 / 1')
    expect(screen.queryByRole('button', { name: /review missed/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to deck' }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('End session shows results for the cards answered so far', async () => {
    const { user } = setup(4)
    await user.click(screen.getByRole('button', { name: 'Missed' }))
    await user.click(screen.getByRole('button', { name: 'End session' }))
    expect(screen.getByTestId('score')).toHaveTextContent('0 / 1')
  })

  it('ending before answering anything says so and offers no review', async () => {
    const { user } = setup(2)
    await user.click(screen.getByRole('button', { name: 'End session' }))
    expect(screen.getByText('No cards were answered.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /review missed/i })).not.toBeInTheDocument()
  })
})

describe('keyboard shortcuts', () => {
  it('Space flips', async () => {
    const { user } = setup()
    await user.keyboard(' ')
    expect(card()).toHaveTextContent('Answer 1')
    await user.keyboard(' ')
    expect(card()).toHaveTextContent('Question 1')
  })

  it('ArrowRight and K mean got it; ArrowLeft and J mean missed', async () => {
    const { user } = setup(5)
    await user.keyboard('{ArrowRight}')
    await user.keyboard('k')
    await user.keyboard('{ArrowLeft}')
    await user.keyboard('J')
    expect(screen.getByText('Card 5 of 5')).toBeInTheDocument()
    await user.keyboard('K')
    expect(screen.getByTestId('score')).toHaveTextContent('3 / 5')
    expect(screen.getByText('Missed cards (2)')).toBeInTheDocument()
  })

  it('shortcuts reset the flip when advancing', async () => {
    const { user } = setup()
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')
    expect(card()).toHaveTextContent('Question 2')
  })

  it('Escape ends the session', async () => {
    const { user } = setup()
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{Escape}')
    expect(screen.getByTestId('score')).toHaveTextContent('1 / 1')
  })

  it('Space after clicking a button does not also trigger that button', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Got it' })) // focus stays on the button
    await user.keyboard(' ')
    expect(card()).toHaveTextContent('Answer 2')
    expect(screen.getByText('Card 2 of 4')).toBeInTheDocument()
  })

  it('ignores shortcuts while typing in a field', async () => {
    const { user } = setup()
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.focus()
    await user.keyboard('k j {ArrowRight}')
    expect(screen.getByText('Card 1 of 4')).toBeInTheDocument()
    field.remove()
  })

  it('does not respond to shortcuts after the session is finished', async () => {
    const { user } = setup(1)
    await user.keyboard('k')
    expect(screen.getByTestId('score')).toHaveTextContent('1 / 1')
    await user.keyboard('j')
    expect(screen.getByTestId('score')).toHaveTextContent('1 / 1')
  })
})
