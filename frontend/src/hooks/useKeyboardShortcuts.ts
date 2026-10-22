import { useEffect } from 'react'

export interface ShortcutHandlers {
  onFlip: () => void
  onGotIt: () => void
  onMissed: () => void
  onEnd: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    // Regions that handle their own keys (e.g. the "more information" panel).
    target.closest('[data-no-shortcuts]') !== null
  )
}

/** Space flip, → / K got it, ← / J missed, Esc end. */
export function useKeyboardShortcuts({ onFlip, onGotIt, onMissed, onEnd }: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      switch (e.key) {
        case ' ':
          e.preventDefault() // no page scroll, and don't also "click" a focused button
          if (!e.repeat) onFlip()
          break
        case 'ArrowRight':
        case 'k':
        case 'K':
          e.preventDefault()
          if (!e.repeat) onGotIt()
          break
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault()
          if (!e.repeat) onMissed()
          break
        case 'Escape':
          onEnd()
          break
      }
    }
    // Browsers fire a focused button's click on Space *keyup*; swallow it.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isTypingTarget(e.target)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [onFlip, onGotIt, onMissed, onEnd])
}
