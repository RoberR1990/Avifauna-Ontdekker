// Vogel-o-meter: maakt van lengte/hoogte/gewicht/spanwijdte een kindvriendelijke vergelijking.
// Puur (geen React), getest in compare.test.ts. Zie docs/FASE-1.md §7.
//
// Regels: facts gaat voor; Wikidata alleen als de facts-waarde null is en het geen niet-vogel is.
// Het midden van de range wordt vergeleken, de echte range staat in `detail`.
// Geen waarde -> geen vergelijking. Nooit schatten.
import type { BundleSpecies, Lang, Range } from '../../data/types'

export type ComparisonKind = 'length' | 'height' | 'mass' | 'wingspan'

export type RefId =
  | 'newborn'
  | 'adult'
  | 'child-1' | 'child-2' | 'child-3' | 'child-4' | 'child-5' | 'child-6' | 'child-8' | 'child-10'
  | 'milk' | 'apple' | 'egg' | 'coin' | 'paperclip'
  | 'match' | 'card' | 'pen' | 'a4'

export interface Comparison {
  kind: ComparisonKind
  /** Kant-en-klare zin in de gevraagde taal, bv. "Van snavel tot staart bijna zo lang als een kind van 1". */
  sentence: string
  /** De echte range, bv. "Lengte ongeveer 56–70 cm". */
  detail: string
  ref: RefId
  /** Aantal (of vermenigvuldiger) als de zin een telling is: "4,5 pakken melk", "1,5 keer zo hoog". */
  count?: number
  /** Midden van de gemeten range gedeeld door de referentiewaarde (voor de silhouetverhouding). */
  ratio: number
}

// ---------------------------------------------------------------------------
// Referentietabel
// ---------------------------------------------------------------------------
// Kinderen: mediaan van jongens en meisjes gemiddeld, afgerond.
//  - Lengte/gewicht tot 5 jaar: WHO Child Growth Standards (lengte-/gewicht-voor-leeftijd,
//    mediaan; 0-2 jaar liggend gemeten, daarna staand).
//  - 6-10 jaar: WHO Growth Reference 2007 (5-19 jaar) en CDC-groeicurven 2000, mediaan.
//  Pasgeborene: WHO-mediaan bij geboorte, 49,9 cm (j) / 49,1 cm (m) en 3,3 kg (j) / 3,2 kg (m).
// Volwassene: Nederlands gemiddelde, afgerond (CBS Statline "Lengte en gewicht van personen":
//  mannen ca. 181 cm / 84 kg, vrouwen ca. 168 cm / 70 kg -> 175 cm / 77 kg).
// Armspanwijdte is ongeveer gelijk aan de lichaamslengte (ratio ~1,0 bij kinderen en volwassenen),
//  daarom gebruiken we dezelfde cm-waarden voor "met de armen wijd".
// Voorwerpen:
//  - Pak melk: 1 liter volle melk weegt ca. 1,03 kg (dichtheid ~1,03 kg/L); het pak zelf telt niet mee.
//  - Appel: USDA FoodData Central, middelgrote appel 182 g, kleine 149 g; NEVO-appel ca. 150-200 g -> 180 g.
//  - Kippenei: EU-klasse M 53-63 g, L 63-73 g; gangbaar gemiddelde met schaal ca. 60 g.
//  - Euromunt van 1 euro: 7,5 g (ECB-specificatie).
//  - Paperclip (standaard, 28 mm): ca. 1 g.
//  - Lucifer (veiligheidslucifer): ca. 4,5 cm.
//  - Speelkaart (pokerformaat 3,5 inch): 8,9 cm lange kant.
//  - Pen (balpen zoals BIC Cristal): 14,9 cm -> 15 cm.
//  - A4-vel: 29,7 cm lange kant (ISO 216).
export const CHILD_AGES = [1, 2, 3, 4, 5, 6, 8, 10] as const
export type ChildAge = (typeof CHILD_AGES)[number]

/** Lengte in cm per leeftijd (WHO-mediaan, jongens/meisjes gemiddeld). */
export const CHILD_LENGTH_CM: Record<ChildAge, number> = { 1: 75, 2: 87, 3: 96, 4: 103, 5: 110, 6: 116, 8: 128, 10: 139 }
/** Gewicht in gram per leeftijd (WHO/CDC-mediaan, gemiddeld). */
export const CHILD_MASS_G: Record<ChildAge, number> = { 1: 9300, 2: 11900, 3: 14100, 4: 16100, 5: 18300, 6: 20500, 8: 25400, 10: 32000 }

export const NEWBORN_LENGTH_CM = 50
export const NEWBORN_MASS_G = 3300
export const ADULT_LENGTH_CM = 175
export const ADULT_MASS_G = 77000

interface Ref {
  id: RefId
  /** Waarde in cm (lengte/hoogte/spanwijdte) of g (gewicht); ontbreekt = niet bruikbaar voor die soort meting. */
  cm?: number
  g?: number
  /** Mensen: tellen alleen als geheel aantal ("3 kinderen van 8"). Voorwerpen mogen ook half als `half`. */
  person?: boolean
  half?: boolean
  /** Pasgeborene: nooit tellen ("2 baby's" is een vreemde maat). */
  single?: boolean
  /** Lengte: mag "N keer zo lang als" worden (alleen de volwassene). */
  times?: boolean
}

const REFS: Ref[] = [
  { id: 'newborn', cm: NEWBORN_LENGTH_CM, g: NEWBORN_MASS_G, person: true, single: true },
  ...CHILD_AGES.map((a): Ref => ({ id: `child-${a}` as RefId, cm: CHILD_LENGTH_CM[a], g: CHILD_MASS_G[a], person: true })),
  { id: 'adult', cm: ADULT_LENGTH_CM, g: ADULT_MASS_G, person: true, times: true },
  { id: 'milk', g: 1030, half: true },
  { id: 'apple', g: 180, half: true },
  { id: 'egg', g: 60, half: true },
  { id: 'coin', g: 7.5 },
  { id: 'paperclip', g: 1 },
  { id: 'match', cm: 4.5 },
  { id: 'card', cm: 8.9 },
  { id: 'pen', cm: 15 },
  { id: 'a4', cm: 29.7 },
]

export function refValue(id: RefId, unit: 'cm' | 'g'): number | undefined {
  const r = REFS.find((x) => x.id === id)
  return unit === 'cm' ? r?.cm : r?.g
}

// ---------------------------------------------------------------------------
// Passen: welke formulering hoort bij de verhouding
// ---------------------------------------------------------------------------
type Band = 'about' | 'almost' | 'bit-more' | 'count' | 'times'

interface Fit {
  ref: Ref
  band: Band
  /** Aantal (alleen bij count/times); 1 bij een band. */
  n: number
  ratio: number
  score: number
}

const MAX_COUNT = 12

function roundHalf(x: number): number {
  return Math.round(x * 2) / 2
}

function fit(ref: Ref, value: number, refValueNum: number, unit: 'cm' | 'g'): Fit | null {
  const ratio = value / refValueNum
  const make = (band: Band, n: number): Fit => ({
    ref,
    band,
    n,
    ratio,
    // Afwijking na afronding + lichte straf voor grote aantallen (liever "4 kinderen" dan "11").
    score: Math.abs(Math.log(ratio / n)) + (n > 1 ? 0.05 * Math.log(n) : 0),
  })
  if (ratio >= 0.9 && ratio <= 1.1) return make('about', 1)
  if (ratio >= 0.75 && ratio < 0.9) return make('almost', 1)
  if (ratio > 1.1 && ratio < 1.35) return make('bit-more', 1)
  if (ratio >= 1.35) {
    if (ref.times) {
      const n = roundHalf(ratio)
      return n >= 1.5 && n <= 6 ? make('times', n) : null
    }
    // Tellen: alleen als de eenheid optelbaar is (gewicht).
    if (unit === 'g' && !ref.single) {
      const n = ref.half ? roundHalf(ratio) : Math.round(ratio)
      const min = ref.half ? 1.5 : 2
      return n >= min && n <= MAX_COUNT ? make('count', n) : null
    }
    return null
  }
  // ratio < 0.75: alleen "een half ..." bij voorwerpen die we kunnen halveren
  if (ref.half && unit === 'g' && ratio >= 0.38) return make('count', 0.5)
  return null
}

function best(value: number, unit: 'cm' | 'g'): Fit | null {
  let top: Fit | null = null
  for (const ref of REFS) {
    const rv = unit === 'cm' ? ref.cm : ref.g
    if (rv === undefined) continue
    const f = fit(ref, value, rv, unit)
    if (f && (!top || f.score < top.score - 1e-9)) top = f
  }
  return top
}

// ---------------------------------------------------------------------------
// Teksten
// ---------------------------------------------------------------------------
interface RefName {
  /** Enkelvoud met lidwoord ("een pak melk"), meervoud zonder lidwoord ("pakken melk"), half ("een half pak melk"). */
  one: string
  many: string
  half?: string
}

function num(n: number, lang: Lang): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1)
  return lang === 'nl' ? s.replace('.', ',') : s
}

function refName(id: RefId, lang: Lang, wingspan: boolean): RefName {
  if (id.startsWith('child-')) {
    const a = id.slice(6)
    if (lang === 'nl')
      return { one: wingspan ? `een kind van ${a} met de armen wijd` : `een kind van ${a}`, many: `kinderen van ${a}` }
    return { one: wingspan ? `a child aged ${a} with arms outstretched` : `a child aged ${a}`, many: `children aged ${a}` }
  }
  switch (id) {
    case 'newborn':
      return lang === 'nl'
        ? { one: wingspan ? 'een pasgeboren baby met de armpjes wijd' : 'een pasgeboren baby', many: "pasgeboren baby's" }
        : { one: wingspan ? 'a newborn baby with arms outstretched' : 'a newborn baby', many: 'newborn babies' }
    case 'adult':
      return lang === 'nl'
        ? { one: wingspan ? 'een volwassene met de armen wijd' : 'een volwassene', many: 'volwassenen' }
        : { one: wingspan ? 'an adult with arms outstretched' : 'an adult', many: 'adults' }
    case 'milk':
      return lang === 'nl'
        ? { one: 'een pak melk', many: 'pakken melk', half: 'een half pak melk' }
        : { one: 'a carton of milk', many: 'cartons of milk', half: 'half a carton of milk' }
    case 'apple':
      return lang === 'nl'
        ? { one: 'een appel', many: 'appels', half: 'een halve appel' }
        : { one: 'an apple', many: 'apples', half: 'half an apple' }
    case 'egg':
      return lang === 'nl'
        ? { one: 'een kippenei', many: 'kippeneieren', half: 'een half kippenei' }
        : { one: "a hen's egg", many: "hen's eggs", half: "half a hen's egg" }
    case 'coin':
      return lang === 'nl' ? { one: 'een munt van 1 euro', many: 'munten van 1 euro' } : { one: 'a 1-euro coin', many: '1-euro coins' }
    case 'paperclip':
      return lang === 'nl' ? { one: 'een paperclip', many: 'paperclips' } : { one: 'a paperclip', many: 'paperclips' }
    case 'match':
      return lang === 'nl' ? { one: 'een lucifer', many: 'lucifers' } : { one: 'a match', many: 'matches' }
    case 'card':
      return lang === 'nl'
        ? { one: 'een speelkaart (lange kant)', many: 'speelkaarten' }
        : { one: 'a playing card (long side)', many: 'playing cards' }
    case 'pen':
      return lang === 'nl' ? { one: 'een pen', many: 'pennen' } : { one: 'a pen', many: 'pens' }
    case 'a4':
      return lang === 'nl'
        ? { one: 'een vel A4-papier (lange kant)', many: 'vellen A4-papier' }
        : { one: 'a sheet of A4 paper (long side)', many: 'sheets of A4 paper' }
    default:
      return { one: id, many: id }
  }
}

interface Words {
  /** "zo lang/zwaar/hoog/breed" */
  as: string
  /** vergrotende trap + "dan" ("langer dan") */
  more: string
  /** voorzetsel-opening */
  lead: string
}

function words(kind: ComparisonKind, lang: Lang, isBird: boolean): Words {
  if (lang === 'nl') {
    switch (kind) {
      case 'length':
        return { as: 'zo lang', more: 'langer dan', lead: isBird ? 'Van snavel tot staart ' : 'Van kop tot staart ' }
      case 'height':
        return { as: 'zo hoog', more: 'hoger dan', lead: '' }
      case 'mass':
        return { as: 'zo zwaar', more: 'zwaarder dan', lead: '' }
      case 'wingspan':
        return { as: 'zo breed', more: 'breder dan', lead: 'Met gespreide vleugels ' }
    }
  }
  switch (kind) {
    case 'length':
      return { as: 'as long', more: 'longer than', lead: isBird ? 'From beak to tail ' : 'From head to tail ' }
    case 'height':
      return { as: 'as tall', more: 'taller than', lead: '' }
    case 'mass':
      return { as: 'as heavy', more: 'heavier than', lead: '' }
    case 'wingspan':
      return { as: 'as wide', more: 'wider than', lead: 'With wings spread ' }
  }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function sentenceFor(kind: ComparisonKind, f: Fit, lang: Lang, isBird: boolean): string {
  const w = words(kind, lang, isBird)
  const name = refName(f.ref.id, lang, kind === 'wingspan')
  const nl = lang === 'nl'
  let body: string
  switch (f.band) {
    case 'about':
      body = nl ? `ongeveer ${w.as} als ${name.one}` : `about ${w.as} as ${name.one}`
      break
    case 'almost':
      body = nl ? `bijna ${w.as} als ${name.one}` : `almost ${w.as} as ${name.one}`
      break
    case 'bit-more':
      body = nl ? `iets ${w.more} ${name.one}` : `a bit ${w.more} ${name.one}`
      break
    case 'times':
      body = nl
        ? `ongeveer ${num(f.n, lang)} keer ${w.as} als ${name.one}`
        : `about ${num(f.n, lang)} times ${w.as} as ${name.one}`
      break
    case 'count':
      if (f.n === 0.5 && name.half) body = nl ? `ongeveer ${w.as} als ${name.half}` : `about ${w.as} as ${name.half}`
      else body = nl ? `ongeveer ${w.as} als ${num(f.n, lang)} ${name.many}` : `about ${w.as} as ${num(f.n, lang)} ${name.many}`
      break
  }
  return capital(w.lead + body)
}

function fmt(x: number, lang: Lang): string {
  const r = Math.round(x * 10) / 10
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1)
  return lang === 'nl' ? s.replace('.', ',') : s
}

function rangeText(range: Range, unit: 'cm' | 'g', lang: Lang): string {
  const [a, b] = range
  if (unit === 'g' && b >= 1000) {
    const k = (x: number) => fmt(x / 1000, lang)
    return a === b ? `${k(a)} kg` : `${k(a)}–${k(b)} kg`
  }
  const u = unit === 'g' ? 'g' : 'cm'
  return a === b ? `${fmt(a, lang)} ${u}` : `${fmt(a, lang)}–${fmt(b, lang)} ${u}`
}

const DETAIL_LABEL: Record<ComparisonKind, Record<Lang, string>> = {
  length: { nl: 'Lengte ongeveer', en: 'Length about' },
  height: { nl: 'Hoogte ongeveer', en: 'Height about' },
  mass: { nl: 'Gewicht ongeveer', en: 'Weight about' },
  wingspan: { nl: 'Spanwijdte ongeveer', en: 'Wingspan about' },
}

// ---------------------------------------------------------------------------
// Hoofdfunctie
// ---------------------------------------------------------------------------
function validRange(r: Range | null | undefined): r is Range {
  return !!r && r.length === 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] > 0 && r[0] <= r[1]
}

/** Facts gaat voor; Wikidata alleen als facts-waarde ontbreekt en de soort geen niet-vogel is. */
function pick(factsValue: Range | null | undefined, wikidata: number | null | undefined, allowWikidata: boolean): Range | null {
  if (validRange(factsValue)) return factsValue
  if (allowWikidata && typeof wikidata === 'number' && Number.isFinite(wikidata) && wikidata > 0) return [wikidata, wikidata]
  return null
}

export function compareSpecies(s: BundleSpecies, lang: Lang): Comparison[] {
  const facts = s.facts
  const isBird = facts?.is_bird !== false
  const allowWd = isBird
  const out: Comparison[] = []

  const add = (kind: ComparisonKind, range: Range | null, unit: 'cm' | 'g') => {
    if (!range) return
    const mid = (range[0] + range[1]) / 2
    const f = best(mid, unit)
    if (!f) return
    out.push({
      kind,
      sentence: sentenceFor(kind, f, lang, isBird),
      detail: `${DETAIL_LABEL[kind][lang]} ${rangeText(range, unit, lang)}`,
      ref: f.ref.id,
      ...(f.band === 'count' || f.band === 'times' ? { count: f.n } : {}),
      ratio: f.ratio,
    })
  }

  const height = validRange(facts?.height_cm) ? facts.height_cm : null
  if (height) add('height', height, 'cm')
  else add('length', pick(facts?.length_cm, null, false), 'cm')
  add('mass', pick(facts?.mass_g, s.wikidata?.mass_g, allowWd), 'g')
  add('wingspan', pick(facts?.wingspan_cm, s.wikidata?.wingspan_cm, allowWd), 'cm')
  return out
}
