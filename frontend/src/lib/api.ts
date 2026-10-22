import type {
  AppConfig,
  CardCreate,
  CardPatch,
  Deck,
  DeckList,
  GenerateInput,
  GroupPatch,
  Job,
  MoreInfo,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{ loc, msg }, ...]
    const msgs = detail.map((d) => (typeof d?.msg === 'string' ? d.msg : '')).filter(Boolean)
    if (msgs.length) return msgs.join('; ')
  }
  return fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?', 0)
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      message = detailMessage(body?.detail, message)
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

const enc = encodeURIComponent

export const api = {
  config: () => request<AppConfig>('/config'),

  listDecks: () => request<DeckList>('/decks'),
  getDeck: (id: string) => request<Deck>(`/decks/${enc(id)}`),
  renameDeck: (id: string, title: string) =>
    request<Deck>(`/decks/${enc(id)}`, json('PATCH', { title })),
  deleteDeck: (id: string) => request<void>(`/decks/${enc(id)}`, { method: 'DELETE' }),

  createGroup: (deckId: string, name: string) =>
    request<Deck>(`/decks/${enc(deckId)}/groups`, json('POST', { name })),
  patchGroup: (deckId: string, groupId: string, patch: GroupPatch) =>
    request<Deck>(`/decks/${enc(deckId)}/groups/${enc(groupId)}`, json('PATCH', patch)),
  mergeGroups: (deckId: string, sourceId: string, targetId: string) =>
    request<Deck>(
      `/decks/${enc(deckId)}/groups/merge`,
      json('POST', { source_id: sourceId, target_id: targetId }),
    ),
  deleteGroup: (
    deckId: string,
    groupId: string,
    opts: { moveTo?: string; deleteCards?: boolean },
  ) => {
    const q = new URLSearchParams()
    if (opts.moveTo) q.set('move_to', opts.moveTo)
    if (opts.deleteCards) q.set('delete_cards', 'true')
    const qs = q.toString()
    return request<Deck>(`/decks/${enc(deckId)}/groups/${enc(groupId)}${qs ? `?${qs}` : ''}`, {
      method: 'DELETE',
    })
  },

  createCard: (deckId: string, card: CardCreate) =>
    request<Deck>(`/decks/${enc(deckId)}/cards`, json('POST', card)),
  patchCard: (deckId: string, cardId: string, patch: CardPatch) =>
    request<Deck>(`/decks/${enc(deckId)}/cards/${enc(cardId)}`, json('PATCH', patch)),
  deleteCard: (deckId: string, cardId: string) =>
    request<Deck>(`/decks/${enc(deckId)}/cards/${enc(cardId)}`, { method: 'DELETE' }),

  moreInfo: (deckId: string, cardId: string) =>
    request<MoreInfo>(`/decks/${enc(deckId)}/cards/${enc(cardId)}/more-info`, { method: 'POST' }),

  generate: (input: GenerateInput) => {
    const form = new FormData()
    form.set('density', input.density)
    if (input.title?.trim()) form.set('title', input.title.trim())
    if (input.file) form.set('file', input.file)
    else if (input.text) form.set('text', input.text)
    return request<{ job_id: string }>('/generate', { method: 'POST', body: form })
  },
  getJob: (id: string) => request<Job>(`/jobs/${enc(id)}`),
}
