import { describe, expect, it } from 'vitest'
import type { BundleSpecies } from '../data/types'
import { birdOfTheDay } from './bird-of-day'

const sp = (slug: string, photo = true) => ({ slug, photo: photo ? {} : null }) as unknown as BundleSpecies

describe('birdOfTheDay', () => {
  const list = [sp('c-c'), sp('a-a'), sp('b-b'), sp('d-d', false)]
  it('geeft null bij lege lijst', () => {
    expect(birdOfTheDay([], new Date())).toBeNull()
  })
  it('is stabiel binnen één dag en onafhankelijk van de volgorde', () => {
    const a = birdOfTheDay(list, new Date(2026, 9, 17, 8))
    const b = birdOfTheDay([...list].reverse(), new Date(2026, 9, 17, 22))
    expect(a?.slug).toBe(b?.slug)
  })
  it('wisselt per dag en cyclet door alle soorten met foto', () => {
    const seen = new Set<string>()
    for (let d = 1; d <= 3; d++) seen.add(birdOfTheDay(list, new Date(2026, 9, d))!.slug)
    expect(seen).toEqual(new Set(['a-a', 'b-b', 'c-c']))
  })
  it('valt terug op alle soorten zonder foto', () => {
    expect(birdOfTheDay([sp('x-x', false)], new Date())?.slug).toBe('x-x')
  })
})
