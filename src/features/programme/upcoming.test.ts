import { describe, expect, it } from 'vitest'
import type { Programme } from '../../park/types'
import { fixtureProgramme } from './fixture'
import { inSeason, nextForSpecies, upcoming } from './upcoming'

// 17 oktober 2026 is een zaterdag.
const at = (h: number, m: number, month = 10, day = 17) => new Date(2026, month - 1, day, h, m, 0)

describe('upcoming', () => {
  it('filtert op dag, seizoen en venster en sorteert op starttijd', () => {
    const r = upcoming(fixtureProgramme, at(14, 0))
    expect(r.map((i) => i.title.nl)).toEqual(['Pinguïns voeren', 'Herfstvoeren', 'Roofvogelshow'])
    expect(r.map((i) => i.minutesUntil)).toEqual([12, 20, 60])
  })

  it('laat gestarte items weg en neemt start nu mee (0 min)', () => {
    const r = upcoming(fixtureProgramme, at(14, 12))
    expect(r[0].title.nl).toBe('Pinguïns voeren')
    expect(r[0].minutesUntil).toBe(0)
    expect(upcoming(fixtureProgramme, at(14, 13)).some((i) => i.title.nl === 'Pinguïns voeren')).toBe(false)
  })

  it('respecteert het venster', () => {
    expect(upcoming(fixtureProgramme, at(14, 0), 15).map((i) => i.title.nl)).toEqual(['Pinguïns voeren'])
    expect(upcoming(fixtureProgramme, at(14, 0), 300).map((i) => i.title.nl)).toContain('Te laat voor het venster')
  })

  it('weekdag: maandag-item alleen op maandag', () => {
    const monday = at(15, 0, 10, 19)
    expect(upcoming(fixtureProgramme, monday, 60).map((i) => i.title.nl)).toEqual(['Alleen op maandag'])
  })

  it('seizoen over de jaargrens', () => {
    const p: Programme = {
      last_checked: '2026-01-01',
      source_url: '',
      items: [{ time: '10:00', title: { nl: 'Winter' }, season: { from: '11-01', to: '03-31' } }],
    }
    expect(upcoming(p, at(9, 30, 12, 24))).toHaveLength(1)
    expect(upcoming(p, at(9, 30, 2, 10))).toHaveLength(1)
    expect(upcoming(p, at(9, 30, 7, 10))).toHaveLength(0)
    expect(inSeason({ from: '11-01', to: '03-31' }, at(9, 0, 11, 1))).toBe(true)
    expect(inSeason({ from: '11-01', to: '03-31' }, at(9, 0, 3, 31))).toBe(true)
    expect(inSeason({ from: '11-01', to: '03-31' }, at(9, 0, 4, 1))).toBe(false)
  })

  it('leeg of ongeldig programma geeft niets', () => {
    expect(upcoming(null, at(10, 0))).toEqual([])
    expect(upcoming({ last_checked: '', source_url: '', items: [{ time: 'xx', title: { nl: 'Kapot' } }] }, at(10, 0))).toEqual([])
  })
})

describe('nextForSpecies', () => {
  it('geeft het eerstvolgende item met de soort, ook ver weg', () => {
    expect(nextForSpecies(fixtureProgramme, 'havik', at(8, 0))?.title.nl).toBe('Roofvogelshow')
    expect(nextForSpecies(fixtureProgramme, 'havik', at(8, 0))?.minutesUntil).toBe(420)
  })

  it('geeft null als er niets meer komt of de soort ontbreekt', () => {
    expect(nextForSpecies(fixtureProgramme, 'havik', at(16, 0))).toBeNull()
    expect(nextForSpecies(fixtureProgramme, 'onbekend', at(8, 0))).toBeNull()
  })
})
