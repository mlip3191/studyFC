import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import StudySetupForm from './StudySetupForm'

const groups = [
  { id: 'g1', name: 'Alpha', cardCount: 5 },
  { id: 'g2', name: 'Beta', cardCount: 3 },
  { id: 'g3', name: 'Gamma', cardCount: 7 },
]

function setup(props: Partial<React.ComponentProps<typeof StudySetupForm>> = {}) {
  const onStart = vi.fn()
  const user = userEvent.setup()
  render(<StudySetupForm groups={groups} hasTermCards onStart={onStart} {...props} />)
  return { onStart, user }
}

const total = () => screen.getByTestId('selected-total').textContent
const start = () => screen.getByRole('button', { name: /start studying/i })

describe('group picker', () => {
  it('shows a checkbox with a card count per group', () => {
    setup()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4) // 3 groups + shuffle
    expect(screen.getByLabelText(/Alpha/)).toBeChecked()
    expect(screen.getByText('5 cards')).toBeInTheDocument()
    expect(screen.getByText('3 cards')).toBeInTheDocument()
  })

  it('starts with everything selected and a live total', async () => {
    const { user } = setup()
    expect(total()).toBe('15 cards selected')
    await user.click(screen.getByLabelText(/Beta/))
    expect(total()).toBe('12 cards selected')
    await user.click(screen.getByLabelText(/Beta/))
    expect(total()).toBe('15 cards selected')
  })

  it('select none clears everything and disables Start', async () => {
    const { user, onStart } = setup()
    await user.click(screen.getByRole('button', { name: 'Select none' }))
    expect(total()).toBe('0 cards selected')
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(1) // shuffle only
    expect(start()).toBeDisabled()
    await user.click(start())
    expect(onStart).not.toHaveBeenCalled()
  })

  it('select all re-selects every group and enables Start', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Select none' }))
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(total()).toBe('15 cards selected')
    expect(start()).toBeEnabled()
  })

  it('selecting a single group enables Start', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Select none' }))
    await user.click(screen.getByLabelText(/Gamma/))
    expect(total()).toBe('7 cards selected')
    expect(start()).toBeEnabled()
  })
})

describe('options', () => {
  it('has shuffle on by default and passes options to onStart', async () => {
    const { user, onStart } = setup()
    expect(screen.getByLabelText('Shuffle cards')).toBeChecked()
    await user.click(screen.getByLabelText(/Beta/))
    await user.click(screen.getByLabelText('Mixed'))
    await user.click(start())
    expect(onStart).toHaveBeenCalledWith({
      groupIds: ['g1', 'g3'],
      shuffle: true,
      direction: 'mixed',
    })
  })

  it('can turn shuffle off', async () => {
    const { user, onStart } = setup()
    await user.click(screen.getByLabelText('Shuffle cards'))
    await user.click(start())
    expect(onStart.mock.calls[0][0]).toMatchObject({ shuffle: false, direction: 'term-to-def' })
  })

  it('hides the direction toggle when the deck has no term cards', () => {
    setup({ hasTermCards: false })
    expect(screen.queryByLabelText('Mixed')).not.toBeInTheDocument()
  })

  it('does not preselect empty groups', () => {
    setup({ groups: [...groups, { id: 'g4', name: 'Empty', cardCount: 0 }] })
    expect(screen.getByLabelText(/Empty/)).not.toBeChecked()
    expect(total()).toBe('15 cards selected')
  })
})
