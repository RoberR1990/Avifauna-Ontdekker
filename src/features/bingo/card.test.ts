import { describe, expect, it } from 'vitest'
import { completedLines, isFull, makeCard, mulberry32, seedFor } from './card'
import { fixtureBingo } from './fixture'

describe('mulberry32 en seedFor', () => {
  it('zelfde seed geeft dezelfde reeks', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('seedFor verschilt per dag en teller en is stabiel', () => {
    expect(seedFor('2026-10-17', 0)).toBe(seedFor('2026-10-17', 0))
    expect(seedFor('2026-10-17', 0)).not.toBe(seedFor('2026-10-17', 1))
    expect(seedFor('2026-10-17', 0)).not.toBe(seedFor('2026-10-18', 0))
  })
})

describe('makeCard', () => {
  it('is deterministisch per seed', () => {
    expect(makeCard(fixtureBingo, 9, 7, '2026-10-17')).toEqual(makeCard(fixtureBingo, 9, 7, '2026-10-17'))
    expect(makeCard(fixtureBingo, 9, 7, 'x').cells).not.toEqual(makeCard(fixtureBingo, 9, 8, 'x').cells)
  })
  it('aantallen: round(size x share) soorten, rest gedrag, geen dubbelen', () => {
    for (const [size, sp] of [[9, 5], [16, 10]] as const) {
      const c = makeCard(fixtureBingo, size, 123, '2026-10-17')
      expect(c.cells).toHaveLength(size)
      expect(c.cells.filter((x) => x.startsWith('s:'))).toHaveLength(sp)
      expect(c.cells.filter((x) => x.startsWith('b:'))).toHaveLength(size - sp)
      expect(new Set(c.cells).size).toBe(size)
      expect(c.marked).toEqual([])
      expect(c.lines).toBe(0)
      expect(c.size).toBe(size)
    }
  })
  it('te weinig soorten: aanvullen met gedrag', () => {
    const c = makeCard({ ...fixtureBingo, species: ['aap', 'beer', 'dodo'] }, 9, 1, 'd')
    expect(c.cells).toHaveLength(9)
    expect(c.cells.filter((x) => x.startsWith('s:'))).toHaveLength(3)
    expect(new Set(c.cells).size).toBe(9)
  })
  it('dubbele slugs in de bundel geven geen dubbele vakjes', () => {
    const c = makeCard({ ...fixtureBingo, species: ['aap', 'aap', 'beer'] }, 9, 1, 'd')
    expect(new Set(c.cells).size).toBe(c.cells.length)
  })
})

describe('completedLines en isFull', () => {
  it('3x3: rij, kolom, diagonalen', () => {
    expect(completedLines([0, 1, 2], 9)).toHaveLength(1)
    expect(completedLines([0, 3, 6], 9)).toHaveLength(1)
    expect(completedLines([0, 4, 8], 9)).toHaveLength(1)
    expect(completedLines([2, 4, 6], 9)).toHaveLength(1)
    expect(completedLines([0, 1, 3, 4], 9)).toHaveLength(0)
    expect(completedLines([0, 1, 2, 3, 4, 5, 6, 7, 8], 9)).toHaveLength(8)
  })
  it('4x4: rij, kolom, diagonalen', () => {
    expect(completedLines([4, 5, 6, 7], 16)).toHaveLength(1)
    expect(completedLines([1, 5, 9, 13], 16)).toHaveLength(1)
    expect(completedLines([0, 5, 10, 15], 16)).toHaveLength(1)
    expect(completedLines([3, 6, 9, 12], 16)).toHaveLength(1)
    expect(completedLines([0, 1, 2], 16)).toHaveLength(0)
    expect(completedLines(Array.from({ length: 16 }, (_, i) => i), 16)).toHaveLength(10)
  })
  it('isFull', () => {
    expect(isFull([0, 1, 2, 3, 4, 5, 6, 7], 9)).toBe(false)
    expect(isFull([0, 1, 2, 3, 4, 5, 6, 7, 8], 9)).toBe(true)
  })
})
