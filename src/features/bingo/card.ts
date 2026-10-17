// Bingokaart: puur en deterministisch (docs/FASE-2.md §6.2).
import type { BundleBingo } from '../../data/types'
import type { BingoCard } from '../../state/album'

export type CardSize = 9 | 16

/** Kleine, snelle PRNG; zelfde seed geeft dezelfde reeks. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seed uit datum + teller "nieuwe kaart" (FNV-1a). */
export function seedFor(day: string, n: number): number {
  let h = 0x811c9dc5
  for (const ch of `${day}#${n}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * round(size × species_share) soortvakjes ("s:<slug>"), de rest gedrag ("b:<id>").
 * Te weinig soorten: aanvullen met gedrag; te weinig gedrag: aanvullen met soorten.
 * Geen dubbelen, geen vrij vak.
 */
export function makeCard(bingo: BundleBingo, size: CardSize, seed: number, day: string): BingoCard {
  const rnd = mulberry32(seed)
  const species = shuffle([...new Set(bingo.species)], rnd)
  const behaviours = shuffle([...new Set(bingo.behaviours.map((b) => b.id))], rnd)
  const wantSpecies = Math.min(size, Math.max(0, Math.round(size * bingo.species_share)))
  let nSpecies = Math.min(wantSpecies, species.length)
  const nBehaviour = Math.min(size - nSpecies, behaviours.length)
  nSpecies = Math.min(species.length, size - nBehaviour)
  const cells = shuffle(
    [...species.slice(0, nSpecies).map((s) => `s:${s}`), ...behaviours.slice(0, nBehaviour).map((b) => `b:${b}`)],
    rnd,
  )
  return { day, size, seed, cells, marked: [], lines: 0 }
}

/** Alle volle lijnen als lijsten vakindexen: rijen, kolommen, 2 diagonalen. */
export function completedLines(marked: readonly number[], size: CardSize): number[][] {
  const n = size === 9 ? 3 : 4
  const set = new Set(marked)
  const all: number[][] = []
  for (let r = 0; r < n; r++) all.push(Array.from({ length: n }, (_, c) => r * n + c))
  for (let c = 0; c < n; c++) all.push(Array.from({ length: n }, (_, r) => r * n + c))
  all.push(Array.from({ length: n }, (_, i) => i * n + i))
  all.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)))
  return all.filter((line) => line.every((i) => set.has(i)))
}

export function isFull(marked: readonly number[], size: CardSize): boolean {
  return new Set(marked).size >= size
}
