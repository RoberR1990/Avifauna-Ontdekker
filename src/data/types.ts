// Contract tussen de build (scripts/park-build) en de app. Zie docs/FASE-1.md.
// De build maakt per taal één bestand: <base>park/data.<lang>.json (type ParkBundle).
import type {
  IucnCategory,
  ParkJson,
  PlacesCollection,
  Programme,
  SpeciesStatus,
} from '../park/types'

export type Lang = 'nl' | 'en'
export type Level = 'kind' | 'b1' | 'kenner'

/** Tekst in beide talen; en mag ontbreken (dan nl tonen). */
export type L10n = { nl: string; en?: string | null }

export type Continent =
  | 'africa' | 'asia' | 'europe' | 'north-america' | 'south-america' | 'oceania' | 'antarctica'

export type ColorName =
  | 'black' | 'white' | 'grey' | 'brown' | 'red' | 'orange' | 'yellow'
  | 'green' | 'blue' | 'purple' | 'pink'

export type SizeClass = 'small' | 'medium' | 'large' | 'giant'

export type Trend = 'decreasing' | 'stable' | 'increasing' | 'unknown'

/** [min, max]; bij één bekende waarde min === max. */
export type Range = [number, number]

/** parks/<park>/facts/<slug>.yaml — zelf verzamelde feiten, met bronnen. */
export interface Facts {
  slug: string
  reviewed: boolean
  /** true voor vogels; zoogdieren/reptielen in het park: false. */
  is_bird: boolean
  /** Lichaamslengte snavel(punt) tot staart(punt), cm. */
  length_cm: Range | null
  /** Staande hoogte, cm; alleen als een bron die noemt (bv. struisvogel, flamingo). */
  height_cm: Range | null
  mass_g: Range | null
  wingspan_cm: Range | null
  lifespan_wild_y: Range | null
  lifespan_captivity_y: Range | null
  clutch: L10n | null
  incubation_days: Range | null
  continents: Continent[]
  range: L10n | null
  /** Ruwe middenpunt van het wilde verspreidingsgebied (voor "x km van het park"). */
  range_center: { lat: number; lon: number } | null
  habitat: L10n | null
  diet: L10n | null
  colors: ColorName[]
  iucn_trend: Trend
  threats: L10n | null
  /** Eén verwonderfeit voor kinderen. */
  wow: L10n | null
  sources: { title: string; url: string }[]
}

export interface SpeciesTextBundle {
  /** Taal van de tekst (kan nl zijn op een en-pagina: fallback). */
  lang: Lang
  kind: string | null
  b1: string | null
  kenner: string | null
  sources: { title: string; url: string }[]
  reviewed: boolean
}

export interface PhotoRef {
  /** Volledig pad onder base, bv. "park/media/photos/x.webp" (relatief, zonder leading slash). */
  url: string
  thumb_url: string
  /** Optioneel: middelgrote foto (800x600, ~50 kB) voor `srcset`; ontbreekt in oudere bundels. */
  medium_url?: string
  /** Index in ParkBundle.attributions (van de grote foto). */
  attribution: number
}

export interface AudioRef {
  opus_url: string | null
  m4a_url: string | null
  attribution: number
}

export interface BundleSpecies {
  slug: string
  scientific_name: string
  /** Naam in de bundeltaal; valt terug op name_nl uit species.csv, daarna wetenschappelijke naam. */
  name: string
  /** Naam in de andere taal (of null). */
  name_alt: string | null
  order: string | null
  family: string | null
  iucn: IucnCategory | null
  /** Wikidata-waarden uit goud (ruw, kunnen fout zijn: facts gaat voor). */
  wikidata: { wingspan_cm: number | null; mass_g: number | null; lifespan_y: number | null }
  zone_id: string | null
  place_id: string | null
  last_seen: string | null
  status: SpeciesStatus
  photo: PhotoRef | null
  audio: AudioRef | null
  links: { wikipedia: string | null; xeno_canto: string | null; wikidata: string | null; park: string | null }
  facts: Facts | null
  /** Afgeleid: uit facts.length_cm/height_cm, anders null. */
  size_class: SizeClass | null
  text: SpeciesTextBundle | null
}

export interface BundleAttribution {
  slug: string
  kind: 'photo' | 'audio' | 'model'
  source: 'wikimedia-commons' | 'xeno-canto' | 'own'
  source_url: string
  creator: string
  license: string
  license_url: string | null
  title: string
  retrieved: string
  modified: string | null
  /** Url van het bestand in de app (relatief aan base). */
  url: string
}

export interface Georef {
  svg: { file: string; width: number; height: number; viewBox: string }
  affine: { a: number; b: number; c: number; d: number; e: number; f: number }
}

export interface ParkBundle {
  lang: Lang
  generated: string
  park: ParkJson
  species: BundleSpecies[]
  places: PlacesCollection
  programme: Programme
  attributions: BundleAttribution[]
  /** Kaart: "park/map/map-base.svg" + georef, of null als het park geen kaart heeft. */
  map: { url: string; georef: Georef } | null
  /** Bestanden voor "download alles voor offline" (foto's groot + audio), relatief aan base. */
  media_manifest: { url: string; bytes: number }[]
}
