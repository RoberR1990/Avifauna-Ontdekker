import { describe, expect, it } from 'vitest'
import type { BundleSpecies } from '../../data/types'
import {
  applyFilters,
  availableOptions,
  emptyFilters,
  iucnGroup,
  normalize,
  parseFilters,
  serializeFilters,
  toggleValue,
  trackFilter,
} from './filter'

const mk = (o: Partial<BundleSpecies> & { continents?: string[]; colors?: string[] }): BundleSpecies =>
  ({
    slug: o.slug ?? 'x',
    scientific_name: o.scientific_name ?? 'Genus species',
    name: o.name ?? 'Naam',
    name_alt: o.name_alt ?? null,
    iucn: o.iucn ?? null,
    zone_id: o.zone_id ?? null,
    size_class: o.size_class ?? null,
    facts: { continents: o.continents ?? [], colors: o.colors ?? [] },
  }) as unknown as BundleSpecies

const pinguin = mk({ slug: 'pinguin', name: 'Humboldtpinguïn', name_alt: 'Humboldt penguin', scientific_name: 'Spheniscus humboldti', iucn: 'VU', zone_id: 'z1', size_class: 'medium', continents: ['south-america'], colors: ['black', 'white'] })
const flamingo = mk({ slug: 'flamingo', name: 'Flamingo', scientific_name: 'Phoenicopterus roseus', iucn: 'LC', zone_id: 'z2', size_class: 'large', continents: ['africa', 'europe'], colors: ['pink'] })
const kakapo = mk({ slug: 'kakapo', name: 'Kakapo', iucn: 'CR', size_class: 'medium', continents: ['oceania'], colors: ['green'] })
const all = [pinguin, flamingo, kakapo]

describe('normalize', () => {
  it('haalt diakrieten en hoofdletters weg', () => {
    expect(normalize('Pinguïn  Ë-é')).toBe('pinguin e e')
  })
})

describe('zoeken', () => {
  const q = (s: string) => applyFilters(all, { ...emptyFilters, q: s }).map((x) => x.slug)
  it('vindt ï als i', () => expect(q('pinguin')).toEqual(['pinguin']))
  it('vindt op naam in andere taal', () => expect(q('penguin')).toEqual(['pinguin']))
  it('vindt op Latijnse naam', () => expect(q('phoenico')).toEqual(['flamingo']))
  it('alle woorden moeten passen', () => expect(q('humboldt penguin')).toEqual(['pinguin']))
  it('leeg = alles', () => expect(q('  ')).toHaveLength(3))
})

describe('filters', () => {
  const f = (p: Partial<typeof emptyFilters>) => applyFilters(all, { ...emptyFilters, ...p }).map((x) => x.slug)
  it('werelddeel: OF binnen facet', () => expect(f({ continents: ['europe', 'oceania'] })).toEqual(['flamingo', 'kakapo']))
  it('EN tussen facetten', () => expect(f({ colors: ['black'], sizes: ['medium'] })).toEqual(['pinguin']))
  it('kleur en zone', () => expect(f({ zones: ['z2'], colors: ['pink'] })).toEqual(['flamingo']))
  it('IUCN-groep bedreigd', () => expect(f({ iucn: ['threatened'] })).toEqual(['pinguin', 'kakapo']))
  it('IUCN-groep niet bedreigd', () => expect(f({ iucn: ['safe'] })).toEqual(['flamingo']))
  it('zonder uitkomst', () => expect(f({ colors: ['blue'] })).toEqual([]))
  it('soort zonder facts valt af bij facetfilter', () => {
    const bare = { ...mk({}), facts: null } as unknown as BundleSpecies
    expect(applyFilters([bare], { ...emptyFilters, colors: ['red'] })).toEqual([])
  })
})

describe('iucnGroup', () => {
  it('groepeert', () => {
    expect([iucnGroup('LC'), iucnGroup('NT'), iucnGroup('EN'), iucnGroup('DD'), iucnGroup(null)]).toEqual(['safe', 'safe', 'threatened', 'other', null])
  })
})

describe('availableOptions', () => {
  it('geeft alleen voorkomende waarden, in vaste volgorde', () => {
    const o = availableOptions(all)
    expect(o.continents).toEqual(['europe', 'africa', 'south-america', 'oceania'])
    expect(o.colors).toEqual(['green', 'pink', 'black', 'white'])
    expect(o.sizes).toEqual(['medium', 'large'])
    expect(o.zones).toEqual(['z1', 'z2'])
    expect(o.iucn).toEqual(['safe', 'threatened'])
  })
})

describe('URL', () => {
  it('rondje serialize/parse', () => {
    const f = { ...emptyFilters, q: 'pin', colors: ['black' as const, 'white' as const], zones: ['z1'] }
    const p = serializeFilters(f)
    expect(p.toString()).toBe('q=pin&k=black%2Cwhite&z=z1')
    expect(parseFilters(p)).toEqual(f)
  })
  it('behoudt andere parameters en wist lege', () => {
    const p = serializeFilters(emptyFilters, new URLSearchParams('x=1&k=red'))
    expect(p.toString()).toBe('x=1')
  })
  it('negeert onbekende waarden', () => {
    const p = new URLSearchParams('k=black,neon&i=safe')
    expect(parseFilters(p, availableOptions(all))).toMatchObject({ colors: ['black'], iucn: ['safe'] })
  })
})

describe('toggleValue / trackFilter', () => {
  it('toggelt', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b'])
  })
  it('stub doet niets', () => expect(trackFilter('colors')).toBeUndefined())
})
