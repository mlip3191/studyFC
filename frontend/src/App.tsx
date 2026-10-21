import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import DeckDetail from './pages/DeckDetail'
import DeckListPage from './pages/DeckList'
import StudySession from './pages/StudySession'
import StudySetup from './pages/StudySetup'
import Upload from './pages/Upload'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DeckListPage />} />
        <Route path="new" element={<Upload />} />
        <Route path="decks/:deckId" element={<DeckDetail />} />
        <Route path="decks/:deckId/study" element={<StudySetup />} />
        <Route path="decks/:deckId/study/session" element={<StudySession />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function NotFound() {
  return <p className="py-10 text-center text-slate-500">Page not found.</p>
}
