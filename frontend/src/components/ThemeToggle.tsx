import { useTheme } from '../lib/theme'
import { btnGhost } from '../lib/ui'

const LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const

export default function ThemeToggle() {
  const { pref, cycle } = useTheme()
  return (
    <button
      type="button"
      className={btnGhost}
      onClick={cycle}
      aria-label={`Theme: ${LABEL[pref]}. Click to change.`}
      title="Change theme"
    >
      <span aria-hidden>{pref === 'dark' ? '🌙' : pref === 'light' ? '☀️' : '🖥️'}</span>
      {LABEL[pref]}
    </button>
  )
}
