import { describe, expect, it } from 'vitest'
import type { BundleSpecies, Facts } from '../../data/types'
import { CHILD_LENGTH_CM, CHILD_MASS_G, compareSpecies } from './compare'

function species(f: Partial<Facts> | null, wd: Partial<BundleSpecies['wikidata']> = {}): BundleSpecies {
  const facts: Facts | null =
    f === null
      ? null
      : {
          slug: 'x-y', reviewed: false, is_bird: true, length_cm: null, height_cm: null, mass_g: null, wingspan_cm: null,
          lifespan_wild_y: null, lifespan_captivity_y: null, clutch: null, incubation_days: null, continents: [], range: null,
          range_center: null, habitat: null, diet: null, colors: [], iucn_trend: 'unknown', threats: null, wow: null, sources: [], ...f,
        }
  return { slug: 'x-y', facts, wikidata: { wingspan_cm: null, mass_g: null, lifespan_y: null, ...wd } } as BundleSpecies
}
const by = (s: BundleSpecies, lang: 'nl' | 'en' = 'nl') => Object.fromEntries(compareSpecies(s, lang).map((c) => [c.kind, c]))

describe('referentietabel', () => {
  it('lengtes en gewichten nemen monotoon toe met de leeftijd', () => {
    const l = Object.values(CHILD_LENGTH_CM), m = Object.values(CHILD_MASS_G)
    expect([...l].sort((a, b) => a - b)).toEqual(l)
    expect([...m].sort((a, b) => a - b)).toEqual(m)
  })
})

describe('Humboldtpinguin 56-70 cm, 3,6-5,9 kg', () => {
  const s = species({ length_cm: [56, 70], mass_g: [3600, 5900] })
  it('lengte: bijna zo lang als een kind van 1, nooit van 3', () => {
    const c = by(s).length
    expect(c.ref).toBe('child-1')
    expect(c.sentence).toBe('Van snavel tot staart bijna zo lang als een kind van 1')
    expect(c.sentence).not.toMatch(/van 3|1 kind|jaar/)
    expect(c.detail).toBe('Lengte ongeveer 56–70 cm')
    expect(c.ratio).toBeCloseTo(63 / 75, 5)
  })
  it('gewicht in pakken melk, range in kg', () => {
    const c = by(s).mass
    expect(c.ref).toBe('milk')
    expect(c.count).toBe(4.5)
    expect(c.sentence).toBe('Ongeveer zo zwaar als 4,5 pakken melk')
    expect(c.detail).toBe('Gewicht ongeveer 3,6–5,9 kg')
  })
  it('Engels', () => {
    const c = by(s, 'en')
    expect(c.length.sentence).toBe('From beak to tail almost as long as a child aged 1')
    expect(c.mass.sentence).toBe('About as heavy as 4.5 cartons of milk')
    expect(c.mass.detail).toBe('Weight about 3.6–5.9 kg')
  })
})

describe('struisvogel hoogte 210-275 cm, 63-145 kg', () => {
  const c = by(species({ height_cm: [210, 275], length_cm: [200, 270], mass_g: [63000, 145000] }))
  it('hoogte gaat voor lengte en zegt "hoog"', () => {
    expect(c.length).toBeUndefined()
    expect(c.height.sentence).toBe('Ongeveer 1,5 keer zo hoog als een volwassene')
    expect(c.height.count).toBe(1.5)
  })
  it('gewicht in kinderen', () => {
    expect(c.mass.sentence).toBe('Ongeveer zo zwaar als 4 kinderen van 8')
    expect(c.mass.detail).toBe('Gewicht ongeveer 63–145 kg')
  })
})

describe('Stellers zeearend spanwijdte 195-250 cm', () => {
  it('breder dan een volwassene met de armen wijd', () => {
    const c = by(species({ wingspan_cm: [195, 250] })).wingspan
    expect(c.ref).toBe('adult')
    expect(c.sentence).toBe('Met gespreide vleugels iets breder dan een volwassene met de armen wijd')
    expect(c.detail).toBe('Spanwijdte ongeveer 195–250 cm')
  })
})

describe('regenbooglori ~25-30 cm, ~75-157 g', () => {
  const c = by(species({ length_cm: [25, 30], mass_g: [75, 157] }))
  it('lengte als A4-vel, gewicht in eieren, range in gram', () => {
    expect(c.length.ref).toBe('a4')
    expect(c.mass.ref).toBe('egg')
    expect(c.mass.count).toBe(2)
    expect(c.mass.sentence).toBe('Ongeveer zo zwaar als 2 kippeneieren')
    expect(c.mass.detail).toBe('Gewicht ongeveer 75–157 g')
  })
})

describe('kleine vogel en randgevallen', () => {
  it('kolibrie-achtig: paperclips en speelkaart', () => {
    const c = by(species({ length_cm: [8, 10], mass_g: [3, 4] }))
    expect(c.length.ref).toBe('card')
    expect(c.mass.ref).toBe('paperclip')
  })
  it('nooit meer dan 6 appels: brandgans (1,2–2,2 kg) in pakken melk', () => {
    const m = by(species({ is_bird: true, mass_g: [1210, 2230] })).mass
    expect(m.sentence).toMatch(/pak(ken)? melk/)
    expect(m.sentence).not.toMatch(/appel/)
  })

  it('half pak melk / halve appel', () => {
    expect(by(species({ mass_g: [450, 550] })).mass.sentence).toBe('Ongeveer zo zwaar als een half pak melk')
    expect(by(species({ mass_g: [90, 90] })).mass.sentence).toBe('Ongeveer zo zwaar als een halve appel')
  })
  it('ontbrekende waarden -> geen vergelijkingen', () => {
    expect(compareSpecies(species({}), 'nl')).toEqual([])
    expect(compareSpecies(species(null), 'nl')).toEqual([])
  })
  it('ongeldige ranges worden genegeerd', () => {
    expect(compareSpecies(species({ length_cm: [70, 56], mass_g: [0, 0] }), 'nl')).toEqual([])
  })
  it('geen enkele zin zegt "1 kind"', () => {
    for (const l of [30, 45, 60, 75, 90, 105, 120, 150, 175]) {
      const c = by(species({ length_cm: [l, l] })).length
      if (c) expect(c.sentence).not.toMatch(/\b1 kind\b/)
    }
  })
})

describe('Wikidata-terugval', () => {
  it('facts gaat voor Wikidata', () => {
    const c = by(species({ wingspan_cm: [195, 250] }, { wingspan_cm: 50 })).wingspan
    expect(c.ref).toBe('adult')
  })
  it('Wikidata als facts-waarde null is', () => {
    const c = by(species({ is_bird: true }, { wingspan_cm: 175, mass_g: 1030 }))
    expect(c.wingspan.ref).toBe('adult')
    expect(c.wingspan.detail).toBe('Spanwijdte ongeveer 175 cm')
    expect(c.mass.ref).toBe('milk')
  })
  it('Wikidata zonder facts-bestand wordt gebruikt', () => {
    expect(by(species(null, { mass_g: 1030 })).mass.ref).toBe('milk')
  })
  it('niet-vogel: Wikidata genegeerd; "kop tot staart"', () => {
    const s = species({ is_bird: false, length_cm: [100, 100] }, { wingspan_cm: 175, mass_g: 1030 })
    const c = by(s)
    expect(c.wingspan).toBeUndefined()
    expect(c.mass).toBeUndefined()
    expect(c.length.sentence).toMatch(/^Van kop tot staart/)
  })
})
