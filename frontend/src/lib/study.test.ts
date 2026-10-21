import { describe, expect, it } from 'vitest'
import {
  buildQueue,
  buildReviewQueue,
  initSession,
  isFinished,
  sessionReducer,
  shuffled,
  summarize,
  type SessionState,
  type StudyCard,
  type StudyOptions,
} from './study'
import type { Card, Group } from './types'

const groups: Group[] = [
  { id: 'g2', name: 'Second', order: 1 },
  { id: 'g1', name: 'First', order: 0 },
  { id: 'g3', name: 'Third', order: 2 },
]

function card(id: string, group_id: string, type: Card['type'] = 'qa'): Card {
  return {
    id,
    group_id,
    type,
    front: `front ${id}`,
    back: `back ${id}`,
    created_at: '',
    updated_at: '',
  }
}

const cards: Card[] = [
  card('a', 'g1'),
  card('b', 'g1', 'term'),
  card('c', 'g2'),
  card('d', 'g2', 'term'),
  card('e', 'g3'),
]
const deck = { groups, cards }

const opts = (o: Partial<StudyOptions> = {}): StudyOptions => ({
  groupIds: ['g1', 'g2', 'g3'],
  shuffle: false,
  direction: 'term-to-def',
  ...o,
})

/** Deterministic rng from a fixed sequence (cycles). */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('buildQueue', () => {
  it('only includes selected groups, in group order then deck order', () => {
    const q = buildQueue(deck, opts({ groupIds: ['g2', 'g1'] }))
    expect(q.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(q[0].groupName).toBe('First')
  })

  it('returns nothing when no groups are selected', () => {
    expect(buildQueue(deck, opts({ groupIds: [] }))).toEqual([])
  })

  it('keeps order when shuffle is off and reorders when on', () => {
    const plain = buildQueue(deck, opts()).map((c) => c.id)
    expect(plain).toEqual(['a', 'b', 'c', 'd', 'e'])
    const mixed = buildQueue(deck, opts({ shuffle: true }), seq(0, 0, 0, 0)).map((c) => c.id)
    expect([...mixed].sort()).toEqual(plain)
    expect(mixed).not.toEqual(plain)
  })

  it('applies term direction only to term cards', () => {
    const forward = buildQueue(deck, opts({ direction: 'term-to-def' }))
    expect(forward.find((c) => c.id === 'b')).toMatchObject({ prompt: 'front b', answer: 'back b' })

    const reverse = buildQueue(deck, opts({ direction: 'def-to-term' }))
    expect(reverse.find((c) => c.id === 'b')).toMatchObject({ prompt: 'back b', answer: 'front b' })
    // qa cards never flip direction
    expect(reverse.find((c) => c.id === 'a')).toMatchObject({ prompt: 'front a', answer: 'back a' })
  })

  it('mixed direction picks per term card using the rng', () => {
    const q = buildQueue(deck, opts({ direction: 'mixed' }), seq(0.1, 0.9))
    expect(q.find((c) => c.id === 'b')?.prompt).toBe('back b') // 0.1 < 0.5 -> reversed
    expect(q.find((c) => c.id === 'd')?.prompt).toBe('front d') // 0.9 -> forward
  })
})

describe('shuffled', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const out = shuffled(input, seq(0.3, 0.7, 0.1))
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
    expect([...out].sort()).toEqual(input)
  })
})

function sc(id: string, groupId = 'g1', groupName = 'First'): StudyCard {
  return { id, groupId, groupName, prompt: `p${id}`, answer: `a${id}` }
}

describe('sessionReducer', () => {
  const queue = [sc('1'), sc('2'), sc('3', 'g2', 'Second')]

  it('flips and unflips', () => {
    let s = initSession(queue)
    s = sessionReducer(s, { type: 'flip' })
    expect(s.flipped).toBe(true)
    s = sessionReducer(s, { type: 'flip' })
    expect(s.flipped).toBe(false)
  })

  it('marking records the answer, advances, and resets the flip', () => {
    let s = initSession(queue)
    s = sessionReducer(s, { type: 'flip' })
    s = sessionReducer(s, { type: 'mark', result: 'missed' })
    expect(s.index).toBe(1)
    expect(s.flipped).toBe(false)
    expect(s.answers).toEqual([{ card: queue[0], result: 'missed' }])
  })

  it('finishes after the last card and ignores further actions', () => {
    let s: SessionState = initSession(queue)
    for (let i = 0; i < 3; i++) s = sessionReducer(s, { type: 'mark', result: 'got' })
    expect(isFinished(s)).toBe(true)
    expect(sessionReducer(s, { type: 'mark', result: 'missed' })).toBe(s)
    expect(sessionReducer(s, { type: 'flip' })).toBe(s)
  })

  it('end finishes early and keeps answers so far', () => {
    let s = initSession(queue)
    s = sessionReducer(s, { type: 'mark', result: 'got' })
    s = sessionReducer(s, { type: 'end' })
    expect(isFinished(s)).toBe(true)
    expect(s.answers).toHaveLength(1)
  })
})

describe('summarize', () => {
  it('scores overall and per group and lists missed cards', () => {
    const [c1, c2, c3] = [sc('1'), sc('2'), sc('3', 'g2', 'Second')]
    const summary = summarize([
      { card: c1, result: 'got' },
      { card: c2, result: 'missed' },
      { card: c3, result: 'missed' },
    ])
    expect(summary).toMatchObject({ total: 3, got: 1, missed: 2 })
    expect(summary.perGroup).toEqual([
      { groupId: 'g1', groupName: 'First', total: 2, got: 1 },
      { groupId: 'g2', groupName: 'Second', total: 1, got: 0 },
    ])
    expect(summary.missedCards).toEqual([c2, c3])
  })

  it('handles an empty session', () => {
    expect(summarize([])).toMatchObject({ total: 0, got: 0, missed: 0, perGroup: [] })
  })
})

describe('buildReviewQueue', () => {
  it('uses only the missed cards, shuffled only when asked', () => {
    const missed = [sc('1'), sc('2'), sc('3')]
    expect(buildReviewQueue(missed, false)).toEqual(missed)
    expect(
      buildReviewQueue(missed, true, seq(0, 0))
        .map((c) => c.id)
        .sort(),
    ).toEqual(['1', '2', '3'])
  })
})
