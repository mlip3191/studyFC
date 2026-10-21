import { Link, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-4 pb-16">
      <header className="flex items-center justify-between gap-3 py-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Study Flashcards
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
