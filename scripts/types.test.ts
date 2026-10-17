// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import type {
  AppData, Attributions, BingoFile, ExpeditionsFile, ParkJson, PlacesCollection, Programme, RoutesFile, SpeciesRow, TextFrontmatter,
} from '../src/park/types'

const schemaDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'parks', 'schema')
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (a: Ajv2020) => void
const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true })
addFormats(ajv)
function check(name: string, data: unknown) {
  const v = ajv.compile(JSON.parse(readFileSync(path.join(schemaDir, `${name}.schema.json`), 'utf8')))
  const ok = v(data)
  expect(ok, JSON.stringify(v.errors, null, 1)).toBe(true)
}

// Voorbeeldobjecten getypt met de handgeschreven types: een typefout breekt typecheck, een schemafout deze test.
const park: ParkJson = {
  id: 'voorbeeld', app_name: 'Voorbeeld', park_name: 'Voorbeeldpark', languages: ['nl', 'en'], default_language: 'nl',
  disclaimer_bar: { nl: 'Onofficieel' }, footer: { nl: 'Onofficieel', en: 'Unofficial' },
  about: { builder: 'Robert Riteco', nl: 'Hobbyproject', source_code_url: null, personal_site_url: null },
  links: { official_site: 'https://example.org/', tickets: null },
  theme: { primary: '#E07A2F', background: '#FFF8EE', text: '#2B2118', accent: '#336699' },
  center: { lat: 52.139, lon: 4.649 }, map_georef: 'map/georef.json', noindex: true,
}
const row: SpeciesRow = { scientific_name: 'Spheniscus humboldti', slug: 'spheniscus-humboldti', status: 'draft', wikidata_qid: 'Q224151', zone_id: null }
const places: PlacesCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { id: 'zone-a', kind: 'zone', name_nl: 'Zone A', source: 'manual' },
      geometry: { type: 'Polygon', coordinates: [[[4.1, 52.1], [4.2, 52.1], [4.2, 52.2], [4.1, 52.1]]] } },
    { type: 'Feature', properties: { id: 'wc-a', kind: 'facility', facility_type: 'toilet', name_nl: 'WC', zone_id: 'zone-a', indoor: true, source: 'osm' },
      geometry: { type: 'Point', coordinates: [4.15, 52.15] } },
    { type: 'Feature', properties: { id: 'verblijf-a', kind: 'enclosure', name_nl: 'Verblijf', source: 'veldwerk', last_seen: '2026-10-17' },
      geometry: { type: 'Polygon', coordinates: [[[4.1, 52.1], [4.2, 52.1], [4.2, 52.2], [4.1, 52.1]]] } },
  ],
}
const expeditions: ExpeditionsFile = {
  expeditions: [{
    id: 'e1', title: { nl: 'Titel' }, intro: { nl: 'Intro', en: 'Intro' }, age: '4-6', minutes: 20, season: { from: '04-01', to: '10-31' },
    badge: { id: 'b1', name: { nl: 'Badge' }, icon: 'star' },
    stops: [
      { id: 's1', title: { nl: 'Bij de pinguïns' }, zone_id: 'zone-a', task: { type: 'find', prompt: { nl: 'Zoek' } } },
      { id: 's2', zone_id: 'zone-a', place_id: 'verblijf-a', species: 'spheniscus-humboldti', indoor: false,
        task: { type: 'choose', prompt: { nl: 'Kies' }, options: [{ nl: 'a' }, { nl: 'b' }], answer: 1, hint: { nl: 'Tip' } } },
      { id: 's3', zone_id: 'zone-a', task: { type: 'count', prompt: { nl: 'Tel' }, answer: 4 } },
      { id: 's4', zone_id: 'zone-a', task: { type: 'answer', prompt: { nl: 'Vraag' }, answer: 'pinguïn' } },
    ],
  }],
}
const bingo: BingoFile = {
  sizes: [9, 16], species_share: 0.6, exclude: ['platanus-hispanica'],
  behaviours: [{ id: 'een-poot', icon: 'x', label: { nl: 'Op één poot', en: 'On one leg' }, indoor_ok: true }],
}
const routes: RoutesFile = {
  routes: [{ id: 'kort', profile: 'short', title: { nl: 'Kort' }, intro: { nl: 'Intro' }, waypoints: ['verblijf-a', 'wc-a'], note: { nl: 'Let op' } }],
}
const programme: Programme = {
  last_checked: '2026-10-17', source_url: 'https://example.org/programma',
  items: [{ time: '14:30', days: ['sat'], season: { from: '04-01', to: '09-30' }, title: { nl: 'Voeren' }, place_id: 'verblijf-a', species: ['spheniscus-humboldti'], note: { nl: 'Let op' } }],
}
const front: TextFrontmatter = {
  slug: 'spheniscus-humboldti', lang: 'nl', sources: [{ title: 'Wikidata', url: 'https://www.wikidata.org/wiki/Q224151' }],
  reviewed: true, reviewed_by: 'Robert', reviewed_on: '2026-10-17',
}
const attributions: Attributions = [
  { file: 'media/photos/a.webp', slug: 'spheniscus-humboldti', kind: 'photo', source: 'wikimedia-commons', source_url: 'https://commons.wikimedia.org/x',
    creator: 'X', license: 'CC-BY-4.0', title: 'A', retrieved: '2026-10-17', in_repo: true },
  { file: 'build-cache/audio/a.opus', slug: 'spheniscus-humboldti', kind: 'audio', source: 'xeno-canto', source_url: 'https://xeno-canto.org/1',
    creator: 'Y', license: 'CC-BY-NC-SA-4.0', title: 'XC1', retrieved: '2026-10-17', modified: 'trimmed', in_repo: false },
]
const appData: AppData = {
  park: { id: 'voorbeeld', app_name: 'Voorbeeld', park_name: 'Voorbeeldpark', languages: ['nl'], default_language: 'nl' },
  generated: '2026-10-17T12:00:00Z',
  species: [{
    slug: 'spheniscus-humboldti', scientific_name: 'Spheniscus humboldti', name: 'Humboldtpinguïn', name_alt: null, order: 'Sphenisciformes',
    family: 'Spheniscidae', iucn: 'VU', wingspan_cm: null, mass_g: 4000, lifespan_y: null, zone_id: null, place_id: null, last_seen: null,
    photo: { file: 'media/photos/a.webp', attribution_index: 0 }, audio: [],
    links: { wikipedia: null, xeno_canto: null, wikidata: 'https://www.wikidata.org/wiki/Q224151' },
  }],
}

describe('types passen bij de schemas', () => {
  it('park', () => check('park', park))
  it('species-row', () => check('species-row', row))
  it('places', () => check('places', places))
  it('expeditions', () => check('expeditions', expeditions))
  it('bingo', () => check('bingo', bingo))
  it('routes', () => check('routes', routes))
  it('programme', () => check('programme', programme))
  it('text-frontmatter', () => check('text-frontmatter', front))
  it('attributions', () => check('attributions', attributions))
  it('app-data', () => check('app-data', appData))
})
