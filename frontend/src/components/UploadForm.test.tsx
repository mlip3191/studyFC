import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UploadForm from './UploadForm'

const EXTS = ['.pdf', '.docx', '.pptx', '.md', '.txt']

function setup() {
  const onSubmit = vi.fn()
  const user = userEvent.setup()
  render(<UploadForm supportedExtensions={EXTS} maxUploadMb={1} onSubmit={onSubmit} />)
  return { onSubmit, user }
}

const generate = () => screen.getByRole('button', { name: 'Generate flashcards' })

describe('UploadForm', () => {
  it('disables Generate until there is a file or text', async () => {
    const { user } = setup()
    expect(generate()).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    expect(generate()).toBeDisabled()
    await user.type(screen.getByLabelText('Study guide text'), '# Hi')
    expect(generate()).toBeEnabled()
  })

  it('submits pasted text with density and title', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    await user.type(screen.getByLabelText('Study guide text'), 'some notes')
    await user.click(screen.getByLabelText(/Exhaustive/))
    await user.type(screen.getByLabelText(/Title/), 'My notes')
    await user.click(generate())
    expect(onSubmit).toHaveBeenCalledWith({
      density: 'exhaustive',
      title: 'My notes',
      text: 'some notes',
    })
  })

  it('defaults to standard density', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('tab', { name: 'Paste text' }))
    await user.type(screen.getByLabelText('Study guide text'), 'x')
    await user.click(generate())
    expect(onSubmit.mock.calls[0][0].density).toBe('standard')
  })

  it('accepts a dropped file and submits it', async () => {
    const { user, onSubmit } = setup()
    const file = new File(['hello'], 'guide.md', { type: 'text/markdown' })
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } })
    expect(screen.getByText('guide.md')).toBeInTheDocument()
    await user.click(generate())
    expect(onSubmit).toHaveBeenCalledWith({ density: 'standard', title: '', file })
  })

  it('rejects unsupported file types', () => {
    setup()
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported file type')
    expect(generate()).toBeDisabled()
  })

  it('rejects files over the size limit', () => {
    setup()
    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'big.pdf')
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [big] } })
    expect(screen.getByRole('alert')).toHaveTextContent('1 MB limit')
    expect(generate()).toBeDisabled()
  })
})
