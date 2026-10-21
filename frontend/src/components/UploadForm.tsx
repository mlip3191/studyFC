import { useRef, useState, type DragEvent } from 'react'
import type { Density, GenerateInput } from '../lib/types'
import { btnPrimary, btnSecondary, input, panel } from '../lib/ui'
import ErrorBanner from './ErrorBanner'

const DENSITIES: { value: Density; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Key concepts only' },
  { value: 'standard', label: 'Standard', hint: 'Balanced coverage' },
  { value: 'exhaustive', label: 'Exhaustive', hint: 'Every testable fact' },
]

type Mode = 'file' | 'text'

export interface UploadFormProps {
  supportedExtensions: string[]
  maxUploadMb: number
  disabled?: boolean
  onSubmit: (input: GenerateInput) => void
}

export default function UploadForm({
  supportedExtensions,
  maxUploadMb,
  disabled,
  onSubmit,
}: UploadFormProps) {
  const [mode, setMode] = useState<Mode>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [density, setDensity] = useState<Density>('standard')
  const [title, setTitle] = useState('')
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(next: File | undefined) {
    if (!next) return
    const ext = next.name.includes('.') ? `.${next.name.split('.').pop()!.toLowerCase()}` : ''
    if (!supportedExtensions.includes(ext)) {
      setFile(null)
      setFileError(`Unsupported file type. Use one of: ${supportedExtensions.join(', ')}`)
    } else if (next.size > maxUploadMb * 1024 * 1024) {
      setFile(null)
      setFileError(`That file is larger than the ${maxUploadMb} MB limit.`)
    } else {
      setFile(next)
      setFileError(null)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files[0])
  }

  const ready = mode === 'file' ? file !== null : text.trim().length > 0

  function submit() {
    onSubmit({
      density,
      title,
      ...(mode === 'file' ? { file: file! } : { text }),
    })
  }

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-medium ${
        mode === value
          ? 'bg-indigo-600 text-white'
          : 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  )

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !disabled) submit()
      }}
    >
      <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
        {tab('file', 'Upload file')}
        {tab('text', 'Paste text')}
      </div>

      {mode === 'file' ? (
        <div className="space-y-2">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${
              dragging
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                : 'border-slate-300 dark:border-slate-700'
            }`}
            data-testid="dropzone"
          >
            {file ? (
              <p className="font-medium break-all">{file.name}</p>
            ) : (
              <p className="text-slate-600 dark:text-slate-300">Drag a study guide here</p>
            )}
            <button
              type="button"
              className={btnSecondary}
              onClick={() => inputRef.current?.click()}
            >
              {file ? 'Choose a different file' : 'Choose file'}
            </button>
            <p className="text-xs text-slate-500">
              {supportedExtensions.join(' ')} · up to {maxUploadMb} MB
            </p>
            <input
              ref={inputRef}
              type="file"
              hidden
              data-testid="file-input"
              accept={supportedExtensions.join(',')}
              onChange={(e) => {
                pickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {fileError && <ErrorBanner message={fileError} />}
        </div>
      ) : (
        <textarea
          aria-label="Study guide text"
          className={`${input} min-h-56 resize-y`}
          placeholder="Paste your study guide or notes here. Markdown headings (#) are used as topics."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Card density</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {DENSITIES.map((d) => (
            <label
              key={d.value}
              className={`${panel} flex min-h-14 cursor-pointer flex-col justify-center px-4 py-2 ${
                density === d.value ? 'border-indigo-500 ring-2 ring-indigo-500/40' : ''
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="density"
                  value={d.value}
                  checked={density === d.value}
                  onChange={() => setDensity(d.value)}
                />
                {d.label}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{d.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-medium">
        Title (optional)
        <input
          className={`${input} mt-1 font-normal`}
          placeholder={mode === 'file' && file ? file.name.replace(/\.[^.]+$/, '') : 'Deck title'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <button type="submit" className={`${btnPrimary} w-full`} disabled={!ready || disabled}>
        Generate flashcards
      </button>
    </form>
  )
}
