// Shared Tailwind class strings. Every control is at least 44px tall for touch.

const btn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50'

export const btnPrimary = `${btn} bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400`
export const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700`
export const btnDanger = `${btn} bg-red-600 text-white hover:bg-red-500`
export const btnGhost = `${btn} text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800`

export const input =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-2 focus:outline-indigo-500/40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

export const panel =
  'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900'
