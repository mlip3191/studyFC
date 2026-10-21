import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const KEY = 'theme'
const ORDER: ThemePreference[] = ['system', 'light', 'dark']

export function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )
}

export function applyTheme(pref: ThemePreference): void {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(readPreference)

  useEffect(() => {
    applyTheme(pref)
    try {
      if (pref === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, pref)
    } catch {
      /* storage unavailable */
    }
    if (pref !== 'system' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [pref])

  const cycle = useCallback(() => setPref((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]), [])
  return { pref, cycle }
}
