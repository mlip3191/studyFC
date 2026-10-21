import type { Card, Group } from './types'

/** Which side of a term card is shown first. Q/A cards always show the question first. */
export type Direction = 'term-to-def' | 'def-to-term' | 'mixed'

export interface StudyOptions {
  groupIds: string[]
  shuffle: boolean
  direction: Direction
}

export interface StudyCard {
  id: string
  groupId: string
  groupName: string
  prompt: string
  answer: string
}

export type Rng = () => number

export interface Answer {
  card: StudyCard
  result: 'got' | 'missed'
}

export interface SessionState {
  queue: StudyCard[]
  index: number
  flipped: boolean
  answers: Answer[]
  ended: boolean
}

export type SessionAction =
  { type: 'flip' } | { type: 'mark'; result: Answer['result'] } | { type: 'end' }

export interface GroupScore {
  groupId: string
  groupName: string
  total: number
  got: number
}

export interface Summary {
  total: number
  got: number
  missed: number
  perGroup: GroupScore[]
  missedCards: StudyCard[]
}

/** Fisher–Yates; returns a new array. */
export function shuffled<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function toStudyCard(card: Card, groupName: string, direction: Direction, rng: Rng): StudyCard {
  let reversed = false
  if (card.type === 'term') {
    reversed = direction === 'def-to-term' || (direction === 'mixed' && rng() < 0.5)
  }
  return {
    id: card.id,
    groupId: card.group_id,
    groupName,
    prompt: reversed ? card.back : card.front,
    answer: reversed ? card.front : card.back,
  }
}

/** Cards from the selected groups, in group order then deck order, optionally shuffled. */
export function buildQueue(
  deck: { groups: Group[]; cards: Card[] },
  options: StudyOptions,
  rng: Rng = Math.random,
): StudyCard[] {
  const selected = new Set(options.groupIds)
  const groups = [...deck.groups]
    .sort((a, b) => a.order - b.order)
    .filter((g) => selected.has(g.id))
  const queue = groups.flatMap((g) =>
    deck.cards
      .filter((c) => c.group_id === g.id)
      .map((c) => toStudyCard(c, g.name, options.direction, rng)),
  )
  return options.shuffle ? shuffled(queue, rng) : queue
}

export function buildReviewQueue(missed: StudyCard[], shuffle: boolean, rng: Rng = Math.random) {
  return shuffle ? shuffled(missed, rng) : [...missed]
}

export function initSession(queue: StudyCard[]): SessionState {
  return { queue, index: 0, flipped: false, answers: [], ended: false }
}

export function isFinished(state: SessionState): boolean {
  return state.ended || state.index >= state.queue.length
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (isFinished(state)) return state
  switch (action.type) {
    case 'flip':
      return { ...state, flipped: !state.flipped }
    case 'mark':
      return {
        ...state,
        index: state.index + 1,
        flipped: false,
        answers: [...state.answers, { card: state.queue[state.index], result: action.result }],
      }
    case 'end':
      return { ...state, ended: true }
  }
}

export function summarize(answers: Answer[]): Summary {
  const groups = new Map<string, GroupScore>()
  const missedCards: StudyCard[] = []
  let got = 0
  for (const { card, result } of answers) {
    const score = groups.get(card.groupId) ?? {
      groupId: card.groupId,
      groupName: card.groupName,
      total: 0,
      got: 0,
    }
    score.total += 1
    if (result === 'got') {
      score.got += 1
      got += 1
    } else {
      missedCards.push(card)
    }
    groups.set(card.groupId, score)
  }
  return {
    total: answers.length,
    got,
    missed: missedCards.length,
    perGroup: [...groups.values()],
    missedCards,
  }
}
