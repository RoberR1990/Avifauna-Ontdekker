// Handgeschreven types bij parks/schema/*.schema.json en docs/CONTRACT.md.
// De test scripts/types.test.ts valideert voorbeeldobjecten van deze types tegen de schema's.

export type Lang = 'nl' | 'en'
export type LocalizedNl = { nl: string; en?: string }

// ---- park.json ----
export interface ParkJson {
  $schema?: string
  id: string
  app_name: string
  park_name: string
  languages: string[]
  default_language: string
  disclaimer_bar: Record<string, string> & { nl: string }
  footer: Record<string, string> & { nl: string }
  about: {
    builder: string
    nl: string
    en?: string
    source_code_url?: string | null
    personal_site_url?: string | null
  }
  links: {
    official_site: string
    tickets?: string | null
    programme?: string | null
    map?: string | null
  }
  theme: {
    primary: string
    background: string
    text: string
    accent?: string
    surface?: string
    muted?: string
  }
  center?: { lat: number; lon: number }
  /** Pad (relatief aan de parkmap) naar het georef-bestand, bv. "map/georef.json", of null. */
  map_georef?: string | null
  noindex?: boolean
}

// ---- species.csv ----
export type SpeciesStatus = 'confirmed' | 'draft' | 'absent'

export interface SpeciesRow {
  scientific_name: string
  slug: string
  name_nl?: string | null
  zone_id?: string | null
  place_id?: string | null
  last_seen?: string | null
  wikidata_qid?: string | null
  status: SpeciesStatus
  notes?: string | null
}

// ---- places.geojson ----
export type PlaceKind = 'zone' | 'enclosure' | 'facility' | 'anchor'
export type FacilityType =
  | 'toilet' | 'baby_change' | 'food' | 'water' | 'playground' | 'picnic' | 'show'
  | 'feeding' | 'entrance' | 'exit' | 'first_aid' | 'info' | 'shelter'
export type PlaceSource = 'veldwerk' | 'osm' | 'manual'

export type Position = [number, number] | [number, number, number]
export type PointGeometry = { type: 'Point'; coordinates: Position }
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] }
export type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] }

export interface PlaceProperties {
  id: string
  kind: PlaceKind
  name_nl: string
  name_en?: string
  zone_id?: string
  facility_type?: FacilityType
  indoor?: boolean
  source: PlaceSource
  last_seen?: string
}

export interface PlaceFeature {
  type: 'Feature'
  properties: PlaceProperties
  geometry: PointGeometry | PolygonGeometry | MultiPolygonGeometry
}

export interface PlacesCollection {
  type: 'FeatureCollection'
  name?: string
  features: PlaceFeature[]
}

// ---- expeditions.yaml ----
export type TaskType = 'find' | 'count' | 'look' | 'answer' | 'choose'

export interface ExpeditionTask {
  type: TaskType
  prompt: LocalizedNl
  /** choose: 0-gebaseerde index in options; count: geheel getal. */
  answer?: string | number
  options?: LocalizedNl[]
  hint?: LocalizedNl
}

export interface ExpeditionStop {
  id: string
  zone_id: string
  place_id?: string
  species?: string
  task: ExpeditionTask
  indoor?: boolean
}

export interface Season {
  /** MM-DD */
  from: string
  /** MM-DD */
  to: string
}

export interface Expedition {
  id: string
  title: LocalizedNl
  intro: LocalizedNl
  season?: Season
  badge: { id: string; name: LocalizedNl; icon: string }
  stops: ExpeditionStop[]
}

export interface ExpeditionsFile {
  expeditions: Expedition[]
}

// ---- programme.json ----
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface ProgrammeItem {
  /** HH:MM */
  time: string
  days?: Weekday[]
  season?: Season
  title: LocalizedNl
  place_id?: string
  species?: string[]
  note?: LocalizedNl
}

export interface Programme {
  last_checked: string
  source_url: string
  items: ProgrammeItem[]
}

// ---- texts/<lang>/<slug>.md ----
export interface TextFrontmatter {
  slug: string
  lang: string
  sources: { title: string; url: string }[]
  reviewed: boolean
  reviewed_by?: string
  reviewed_on?: string
}

export type TextLevel = 'kind' | 'b1' | 'kenner'

export interface SpeciesText {
  frontmatter: TextFrontmatter
  sections: { kind: string; b1: string; kenner?: string }
}

// ---- media/attributions.json ----
export type MediaKind = 'photo' | 'audio' | 'model'
export type MediaSource = 'wikimedia-commons' | 'xeno-canto' | 'own'

export interface Attribution {
  file: string
  slug: string
  kind: MediaKind
  source: MediaSource
  source_url: string
  creator: string
  license: string
  license_url?: string
  title: string
  retrieved: string
  modified?: string
  in_repo: boolean
}

export type Attributions = Attribution[]

// ---- goud: app-data.<taal>.json ----
export type IucnCategory = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD' | 'NE'

export interface MediaRef {
  file: string
  attribution_index: number
}

export interface AppSpecies {
  slug: string
  scientific_name: string
  name: string | null
  name_alt: string | null
  order: string | null
  family: string | null
  iucn: IucnCategory | null
  wingspan_cm: number | null
  mass_g: number | null
  lifespan_y: number | null
  zone_id: string | null
  place_id: string | null
  last_seen: string | null
  photo: MediaRef | null
  audio: MediaRef[]
  links: { wikipedia: string | null; xeno_canto: string | null; wikidata: string | null }
}

export interface AppData {
  park: Pick<ParkJson, 'id' | 'app_name' | 'park_name' | 'languages' | 'default_language'> & Partial<ParkJson>
  lang?: string
  /** ISO 8601 date-time */
  generated: string
  species: AppSpecies[]
  attributions?: Attribution[]
}
