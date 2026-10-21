// Mirrors backend/app/models.py and backend/app/routers/schemas.py

export type CardType = 'qa' | 'term'
export type Density = 'light' | 'standard' | 'exhaustive'

export interface Source {
  filename: string
  type: 'pdf' | 'docx' | 'pptx' | 'md' | 'txt' | 'text'
  imported_at: string
}

export interface Group {
  id: string
  name: string
  order: number
}

export interface Card {
  id: string
  group_id: string
  type: CardType
  front: string
  back: string
  created_at: string
  updated_at: string
}

export interface Deck {
  schema_version: 1
  id: string
  title: string
  source: Source | null
  created_at: string
  updated_at: string
  groups: Group[]
  cards: Card[]
}

export interface DeckSummary {
  id: string
  title: string
  group_count: number
  card_count: number
  source: Source | null
  created_at: string
  updated_at: string
}

export interface DeckLoadError {
  filename: string
  error: string
}

export interface DeckList {
  decks: DeckSummary[]
  errors: DeckLoadError[]
}

export interface AppConfig {
  api_key_configured: boolean
  model: string
  max_upload_mb: number
  supported_extensions: string[]
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface Job {
  id: string
  status: JobStatus
  current: number
  total: number
  message: string
  deck_id: string | null
  error: string | null
}

export interface CardCreate {
  group_id: string
  type: CardType
  front: string
  back: string
}

export interface CardPatch {
  front?: string
  back?: string
  type?: CardType
  group_id?: string
}

export interface GroupPatch {
  name?: string
  order?: number
}

export interface GenerateInput {
  file?: File
  text?: string
  density: Density
  title?: string
}
