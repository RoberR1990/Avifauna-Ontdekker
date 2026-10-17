// Pure filterlogica van de Vogelatlas. Geen React, geen DOM.
import type { BundleSpecies, ColorName, Continent, SizeClass } from '../../data/types'

export type IucnGroup = 'safe' | 'threatened' | 'other'

export interface AtlasFilters {
  q: string
  continents: Continent[]
  colors: ColorName[]
  sizes: SizeClass[]
  zones: string[]
  iucn: IucnGroup[]
}

export type FacetName = 'continents' | 'colors' | 'sizes' | 'zones' | 'iucn'
export const FACETS: FacetName[] = ['continents', 'colors', 'sizes', 'zones', 'iucn']

/** URL-parameternaam per facet. */
const PARAM: Record<FacetName, string> = { continents: 'w', colors: 'k', sizes: 'g', zones: 'z', iucn: 'i' }

export const emptyFilters: AtlasFilters = { q: '', continents: [], colors: [], sizes: [], zones: [], iucn: [] }

/** Kleine letters, zonder diakrieten (ï = i), spaties samengevoegd. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function iucnGroup(c: BundleSpecies['iucn']): IucnGroup | null {
  if (!c) return null
  if (c === 'LC' || c === 'NT') return 'safe'
  if (c === 'VU' || c === 'EN' || c === 'CR') return 'threatened'
  return 'other'
}

export function matchesQuery(s: BundleSpecies, q: string): boolean {
  const terms = normalize(q).split(' ').filter(Boolean)
  if (terms.length === 0) return true
  const hay = normalize([s.name, s.name_alt ?? '', s.scientific_name].join(' '))
  return terms.every((t) => hay.includes(t))
}

export function matchesFilters(s: BundleSpecies, f: AtlasFilters): boolean {
  if (!matchesQuery(s, f.q)) return false
  if (f.continents.length && !s.facts?.continents.some((c) => f.continents.includes(c))) return false
  if (f.colors.length && !s.facts?.colors.some((c) => f.colors.includes(c))) return false
  if (f.sizes.length && !(s.size_class && f.sizes.includes(s.size_class))) return false
  if (f.zones.length && !(s.zone_id && f.zones.includes(s.zone_id))) return false
  if (f.iucn.length) {
    const g = iucnGroup(s.iucn)
    if (!g || !f.iucn.includes(g)) return false
  }
  return true
}

/** Binnen een facet geldt OF, tussen facetten EN. Volgorde van de invoer blijft behouden. */
export function applyFilters(species: BundleSpecies[], f: AtlasFilters): BundleSpecies[] {
  return species.filter((s) => matchesFilters(s, f))
}

export function activeFilterCount(f: AtlasFilters): number {
  return FACETS.reduce((n, k) => n + f[k].length, 0) + (f.q.trim() ? 1 : 0)
}

export function hasFilters(f: AtlasFilters): boolean {
  return activeFilterCount(f) > 0
}

export interface FacetOptions {
  continents: Continent[]
  colors: ColorName[]
  sizes: SizeClass[]
  zones: string[]
  iucn: IucnGroup[]
}

const CONTINENT_ORDER: Continent[] = ['europe', 'africa', 'asia', 'north-america', 'south-america', 'oceania', 'antarctica']
const COLOR_ORDER: ColorName[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'grey', 'white']
const SIZE_ORDER: SizeClass[] = ['small', 'medium', 'large', 'giant']
const IUCN_ORDER: IucnGroup[] = ['safe', 'threatened', 'other']

const ordered = <T extends string>(order: T[], present: Set<T>): T[] => order.filter((v) => present.has(v))

/** Alleen waarden die in de data voorkomen. */
export function availableOptions(species: BundleSpecies[]): FacetOptions {
  const continents = new Set<Continent>()
  const colors = new Set<ColorName>()
  const sizes = new Set<SizeClass>()
  const zones = new Set<string>()
  const iucn = new Set<IucnGroup>()
  for (const s of species) {
    s.facts?.continents.forEach((c) => continents.add(c))
    s.facts?.colors.forEach((c) => colors.add(c))
    if (s.size_class) sizes.add(s.size_class)
    if (s.zone_id) zones.add(s.zone_id)
    const g = iucnGroup(s.iucn)
    if (g) iucn.add(g)
  }
  return {
    continents: ordered(CONTINENT_ORDER, continents),
    colors: ordered(COLOR_ORDER, colors),
    sizes: ordered(SIZE_ORDER, sizes),
    zones: [...zones].sort(),
    iucn: ordered(IUCN_ORDER, iucn),
  }
}

// ---- URL ----

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

/** Onbekende waarden worden weggefilterd (gedeelde links kunnen verouderd zijn). */
export function parseFilters(p: URLSearchParams, allowed?: FacetOptions): AtlasFilters {
  const pick = <T extends string>(facet: FacetName): T[] => {
    const vals = csv(p.get(PARAM[facet])) as T[]
    if (!allowed) return vals
    const ok = allowed[facet] as string[]
    return vals.filter((v) => ok.includes(v))
  }
  return {
    q: p.get('q') ?? '',
    continents: pick<Continent>('continents'),
    colors: pick<ColorName>('colors'),
    sizes: pick<SizeClass>('sizes'),
    zones: pick<string>('zones'),
    iucn: pick<IucnGroup>('iucn'),
  }
}

/** Behoudt overige parameters van `base`. */
export function serializeFilters(f: AtlasFilters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base)
  const set = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k))
  set('q', f.q)
  for (const facet of FACETS) set(PARAM[facet], f[facet].join(','))
  return p
}

export function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/**
 * Statistiek-haakje: wordt aangeroepen bij filtergebruik (naam van het filter, bv. "continents").
 * Nu een stub; nooit de zoektekst doorgeven.
 */
export function trackFilter(name: string): void {
  void name
}
