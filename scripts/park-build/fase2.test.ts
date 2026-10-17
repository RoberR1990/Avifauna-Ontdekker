// @vitest-environment node
// Fase 2: expedities, bingo, routes en zone-afleiding in de bundel (docs/FASE-2.md §3, §4).
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { PlaceFeature, PlacesCollection } from '../../src/park/types'
import { buildBundle } from './index'
import { buildPathGraph, computeRouteLine, MAX_SNAP_M, routeMinutes, shortestPath } from './routing'
import type { OsmElement } from './routing'
import { centroidOf, deriveZones, distanceToPolygonM, pointInPolygon, zoneForPoint } from './zones'

const fixturePark = resolve(__dirname, 'fixtures/park')
const now = '2026-10-17T12:00:00Z'
const tmpRoots: string[] = []
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true })
})

// ---------- geometrie ----------
// Eenvoudige kaart rond Avifauna (georef van de fixture). 0,0001 graad lengtegraad is ongeveer 6,8 m.
const box = (id: string, w: number, s: number, e: number, n: number, extra: Record<string, unknown> = {}): PlaceFeature => ({
  type: 'Feature',
  properties: { id, kind: 'zone', name_nl: `Zone ${id}`, name_en: `Zone ${id} (en)`, source: 'manual', ...extra } as PlaceFeature['properties'],
  geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
})
const pt = (id: string, lon: number, lat: number, extra: Record<string, unknown> = {}): PlaceFeature => ({
  type: 'Feature',
  properties: { id, kind: 'enclosure', name_nl: `Plek ${id}`, source: 'manual', ...extra } as PlaceFeature['properties'],
  geometry: { type: 'Point', coordinates: [lon, lat] },
})

const zoneA = box('zone-a', 4.648, 52.139, 4.649, 52.1396)
const zoneB = box('zone-b', 4.649, 52.139, 4.65, 52.1396, { indoor: true })
const zones = [zoneA, zoneB]

describe('zone-afleiding (§3.5)', () => {
  it('punt-in-polygoon en gaten', () => {
    const ring = [[4, 52], [5, 52], [5, 53], [4, 53], [4, 52]] as [number, number][]
    const hole = [[4.4, 52.4], [4.6, 52.4], [4.6, 52.6], [4.4, 52.6], [4.4, 52.4]] as [number, number][]
    expect(pointInPolygon({ lon: 4.2, lat: 52.2 }, [ring])).toBe(true)
    expect(pointInPolygon({ lon: 5.2, lat: 52.2 }, [ring])).toBe(false)
    expect(pointInPolygon({ lon: 4.5, lat: 52.5 }, [ring, hole])).toBe(false)
  })

  it('centroid van punt en polygoon', () => {
    expect(centroidOf(pt('p', 4.1, 52.2))).toEqual({ lon: 4.1, lat: 52.2 })
    const c = centroidOf(zoneA)!
    expect(c.lon).toBeCloseTo(4.6485, 6)
    expect(c.lat).toBeCloseTo(52.1393, 6)
  })

  it('afstand tot de rand in meters', () => {
    // 0,0003 graad oostelijk van de oostrand van zone-b = ca. 20,5 m
    const d = distanceToPolygonM({ lon: 4.6503, lat: 52.1393 }, zoneB.geometry.type === 'Polygon' ? zoneB.geometry.coordinates : [])
    expect(d).toBeGreaterThan(19)
    expect(d).toBeLessThan(22)
  })

  it('binnen een zone: die zone; net buiten (<= 30 m): dichtstbijzijnde; verder: geen', () => {
    expect(zoneForPoint({ lon: 4.6485, lat: 52.1393 }, zones)).toBe('zone-a')
    expect(zoneForPoint({ lon: 4.6495, lat: 52.1393 }, zones)).toBe('zone-b')
    expect(zoneForPoint({ lon: 4.6503, lat: 52.1393 }, zones)).toBe('zone-b') // ca. 20 m
    expect(zoneForPoint({ lon: 4.651, lat: 52.1393 }, zones)).toBeNull() // ca. 68 m
  })

  it('overlappende zones: de kleinste wint', () => {
    const big = box('zone-groot', 4.64, 52.13, 4.66, 52.15)
    expect(zoneForPoint({ lon: 4.6485, lat: 52.1393 }, [big, zoneA])).toBe('zone-a')
  })

  it('deriveZones vult alleen ontbrekende zone_id van niet-zones, en laat de invoer ongemoeid', () => {
    const places: PlacesCollection = {
      type: 'FeatureCollection',
      features: [
        zoneA,
        zoneB,
        pt('in-a', 4.6485, 52.1393),
        pt('in-b-eigen', 4.6485, 52.1393, { zone_id: 'zone-b' }),
        pt('ver-weg', 4.651, 52.1393),
        box('poly-in-b', 4.6492, 52.1392, 4.6496, 52.1394, { kind: 'enclosure' }),
      ],
    }
    const out = deriveZones(places)
    const z = Object.fromEntries(out.features.map((f) => [f.properties.id, f.properties.zone_id]))
    expect(z['in-a']).toBe('zone-a')
    expect(z['in-b-eigen']).toBe('zone-b') // eigen waarde blijft
    expect(z['ver-weg']).toBeUndefined()
    expect(z['poly-in-b']).toBe('zone-b')
    expect(z['zone-a']).toBeUndefined() // zones krijgen geen zone
    expect(places.features[2].properties.zone_id).toBeUndefined() // geen mutatie
  })
})

// ---------- routegraaf ----------
const way = (id: number, highway: string, coords: [number, number][], extra: Record<string, string> = {}): OsmElement => ({
  type: 'way',
  id,
  geometry: coords.map(([lon, lat]) => ({ lat, lon })),
  tags: { highway, ...extra },
})
const P1: [number, number] = [4.6485, 52.1393]
const P2: [number, number] = [4.649, 52.1393]
const P3: [number, number] = [4.6495, 52.1393]
const Q1: [number, number] = [4.6485, 52.1396]
const Q2: [number, number] = [4.6495, 52.1396]
const affine = { a: 169176.4, b: 0, c: 0, d: -275646.5, e: -786004.3, f: 14372636.5 }
const wpStart = { id: 'start', lat: P1[1], lon: P1[0] }
const wpEnd = { id: 'eind', lat: P3[1], lon: P3[0] }

/** Korte route met trap (P1-P3 recht) en een langere omweg over Q1-Q2 (vlak). */
const withSteps: OsmElement[] = [
  way(1, 'steps', [P1, P3]),
  way(2, 'footway', [P1, Q1, Q2, P3], { surface: 'paving_stones' }),
  way(3, 'footway', [P2, [4.649, 52.1396]]), // zijtak
  { type: 'node', id: 9, tags: { amenity: 'bench' } } as OsmElement,
  way(4, 'primary', [[4.7, 52.2], [4.7001, 52.2]], { access: 'private' }), // privé: niet in de graaf
  way(5, 'footway', [[4.7, 52.21], [4.7001, 52.21]], { foot: 'no' }),
  way(6, 'residential', [[4.7, 52.22], [4.7001, 52.22]]),
  way(7, 'waterway', [[4.7, 52.23], [4.7001, 52.23]]),
]

describe('padengraaf en Dijkstra (§3.3)', () => {
  it('bouwt knooppunten uit unieke coördinaten en negeert niet-paden, privé, foot=no', () => {
    const g = buildPathGraph(withSteps)
    // P1,P3 (gedeeld door way 1 en 2), Q1, Q2, P2 + eindpunt zijtak + residential (2 nodes) = 5 + 1 + 2
    expect(g.nodes.length).toBe(8)
  })

  it('profiel all kiest de trap (kortst); stroller de omweg zonder trap', () => {
    const g = buildPathGraph(withSteps)
    const warns: string[] = []
    const all = computeRouteLine(g, [wpStart, wpEnd], 'all', affine, (m) => warns.push(m))
    const stroller = computeRouteLine(g, [wpStart, wpEnd], 'stroller', affine, (m) => warns.push(m))
    expect(warns).toEqual([])
    expect(all.length_m).toBeGreaterThan(60)
    expect(all.length_m).toBeLessThan(75) // recht ca. 68 m
    expect(stroller.length_m).toBeGreaterThan(125) // 33 + 68 + 33 m
    expect(stroller.length_m).toBeLessThan(145)
    expect(stroller.svg_points.split(' ').length).toBeGreaterThan(all.svg_points.split(' ').length)
  })

  it('stroller zonder alternatief: geen pad -> waarschuwing en rechte lijn', () => {
    const g = buildPathGraph([way(1, 'steps', [P1, P3])])
    const warns: string[] = []
    const r = computeRouteLine(g, [wpStart, wpEnd], 'stroller', affine, (m) => warns.push(m), 'route x')
    expect(warns.some((w) => /geen pad tussen start en eind/.test(w))).toBe(true)
    expect(r.length_m).toBeGreaterThan(60)
    expect(r.svg_points.split(' ')).toHaveLength(2)
  })

  it('ruw oppervlak (zand, grind, aarde, gras) telt x5 voor stroller, maar niet voor all', () => {
    const els = [
      way(1, 'footway', [P1, P3], { surface: 'grass' }),
      way(2, 'footway', [P1, Q1, Q2, P3], { surface: 'asphalt' }),
    ]
    const g = buildPathGraph(els)
    const direct = g.nodes.findIndex((n) => n.lon === P1[0] && n.lat === P1[1])
    const end = g.nodes.findIndex((n) => n.lon === P3[0] && n.lat === P3[1])
    expect(shortestPath(g, direct, end, 'all')).toHaveLength(2)
    expect(shortestPath(g, direct, end, 'stroller')).toHaveLength(4)
  })

  it('waypoint verder dan 60 m van het netwerk: waarschuwing en rechte lijn', () => {
    const g = buildPathGraph(withSteps)
    const warns: string[] = []
    const far = { id: 'ver', lat: 52.1393, lon: 4.652 } // ca. 140 m van het dichtstbijzijnde knooppunt
    const r = computeRouteLine(g, [wpStart, far], 'all', affine, (m) => warns.push(m), 'route y')
    expect(MAX_SNAP_M).toBe(60)
    expect(warns).toHaveLength(1)
    expect(warns[0]).toMatch(/route y: waypoint ver ligt \d+ m van het padennetwerk/)
    expect(r.length_m).toBeGreaterThan(200)
    expect(r.svg_points.split(' ')).toHaveLength(2)
  })

  it('svg_points: 1 decimaal en geen dubbele opeenvolgende punten', () => {
    const g = buildPathGraph(withSteps)
    const r = computeRouteLine(g, [wpStart, wpEnd], 'all', affine, () => {})
    for (const p of r.svg_points.split(' ')) expect(p).toMatch(/^-?\d+\.\d,-?\d+\.\d$/)
    const same = computeRouteLine(g, [wpStart, { ...wpStart, id: 'zelfde' }], 'all', affine, () => {})
    expect(same.svg_points.split(' ')).toHaveLength(1)
    expect(same.length_m).toBe(0)
  })

  it('looptijd: 3 km/u (short 2,5 km/u) plus 2 min per stop', () => {
    expect(routeMinutes(1500, 'all', 3)).toBe(36)
    expect(routeMinutes(1500, 'stroller', 0)).toBe(30)
    expect(routeMinutes(1250, 'short', 2)).toBe(34)
  })
})

// ---------- bundel ----------
function parkWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ao-fase2-'))
  tmpRoots.push(dir)
  cpSync(fixturePark, dir, { recursive: true })
  for (const [f, content] of Object.entries(files)) {
    const abs = join(dir, f)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return dir
}

const places: PlacesCollection = {
  type: 'FeatureCollection',
  features: [
    zoneA,
    zoneB,
    pt('verblijf-pinguins', 4.6485, 52.1393, { name_nl: 'Pinguïns', name_en: 'Penguins' }),
    pt('toilet-b', 4.6495, 52.1393, { kind: 'facility', facility_type: 'toilet', name_nl: 'Toilet B' }),
    pt('verblijf-buiten', 4.6503, 52.1393, { name_nl: 'Buitenverblijf', indoor: true }),
    pt('verblijf-ver', 4.652, 52.1393, { name_nl: 'Ver weg' }),
  ],
}

const expeditionsYaml = `expeditions:
  - id: uitje
    title: { nl: Uitje, en: Outing }
    intro: { nl: Intro nl, en: Intro en }
    badge: { id: badge-uitje, name: { nl: Uitjesbadge, en: Outing badge }, icon: "🏅" }
    stops:
      - id: s-zonder-titel
        zone_id: zone-a
        place_id: verblijf-pinguins
        species: spheniscus-humboldti
        task:
          type: find
          prompt: { nl: Zoek de pinguïn, en: Find the penguin }
          hint: { nl: Kijk goed, en: Look closely }
      - id: s-binnen-zone
        title: { nl: Binnen, en: Inside }
        zone_id: zone-b
        task:
          type: choose
          prompt: { nl: Welke kleur? }
          options: [{ nl: Rood, en: Red }, { nl: Blauw }]
          answer: 1
      - id: s-draft
        zone_id: zone-a
        species: struthio-camelus
        task: { type: look, prompt: { nl: Kijk } }
      - id: s-tel-buiten
        title: { nl: Tellen }
        zone_id: zone-a
        task: { type: count, prompt: { nl: Tel }, hint: { nl: Hint } }
      - id: s-tel-binnen
        zone_id: zone-a
        indoor: true
        task: { type: count, prompt: { nl: Tel binnen }, answer: 3 }
      - id: s-open
        zone_id: zone-a
        task: { type: answer, prompt: { nl: Wat vond je mooi? }, answer: ignored }
  - id: alleen-draft
    title: { nl: Leeg }
    intro: { nl: Leeg }
    age: 6-10
    minutes: 25
    season: { from: 10-01, to: 03-31 }
    badge: { id: badge-leeg, name: { nl: Leeg }, icon: x }
    stops:
      - id: s1
        zone_id: zone-a
        species: casuarius-casuarius
        task: { type: look, prompt: { nl: Kijk } }
`

const bingoYaml = `sizes: [9, 16]
species_share: 0.6
exclude: []
behaviours:
  - { id: een-poot, icon: "🦩", label: { nl: Op een poot, en: On one leg }, indoor_ok: true }
  - { id: nest, icon: "🪺", label: { nl: Een nest } }
`

const extract = {
  elements: [
    way(1, 'steps', [P1, P3]),
    way(2, 'footway', [P1, Q1, Q2, P3], { surface: 'paving_stones' }),
  ],
}
const routesYaml = `routes:
  - id: rolstoel
    profile: stroller
    title: { nl: Kinderwagen, en: Pushchair }
    intro: { nl: Intro, en: Intro en }
    waypoints: [verblijf-pinguins, toilet-b]
    note: { nl: Let op de borden }
  - id: kort
    profile: short
    title: { nl: Kort }
    intro: { nl: Kort intro }
    waypoints: [verblijf-pinguins, toilet-b, verblijf-ver]
`

const files = {
  'places.geojson': JSON.stringify(places),
  'expeditions.yaml': expeditionsYaml,
  'bingo.yaml': bingoYaml,
  'routes.yaml': routesYaml,
  'map/osm-extract.json': JSON.stringify(extract),
}

describe('buildBundle: expedities', () => {
  const dir = parkWith(files)
  const nl = buildBundle(dir, 'nl', { buildCacheDirs: [], now })
  const en = buildBundle(dir, 'en', { buildCacheDirs: [], now })

  it('zonder bestanden: lege lijsten / null', () => {
    const r = buildBundle(fixturePark, 'nl', { buildCacheDirs: [], now })
    expect(r.bundle.expeditions).toEqual([])
    expect(r.bundle.bingo).toBeNull()
    expect(r.bundle.routes).toEqual([])
  })

  it('niet-confirmed soort: stop weggelaten met waarschuwing; expeditie zonder stops vervalt', () => {
    expect(nl.bundle.expeditions.map((e) => e.id)).toEqual(['uitje'])
    const ids = nl.bundle.expeditions[0].stops.map((s) => s.id)
    expect(ids).toEqual(['s-zonder-titel', 's-binnen-zone', 's-tel-buiten', 's-tel-binnen', 's-open'])
    expect(nl.warnings.some((w) => /stop s-draft: soort struthio-camelus is niet confirmed/.test(w))).toBe(true)
    expect(nl.warnings.some((w) => /expeditie alleen-draft: geen geldige stops/.test(w))).toBe(true)
  })

  it('standaarden: age all, minutes null, season null; badge gelokaliseerd', () => {
    const e = nl.bundle.expeditions[0]
    expect(e).toMatchObject({ age: 'all', minutes: null, season: null, title: 'Uitje', intro: 'Intro nl' })
    expect(e.badge).toEqual({ id: 'badge-uitje', name: 'Uitjesbadge', icon: '🏅' })
    expect(en.bundle.expeditions[0]).toMatchObject({ title: 'Outing', intro: 'Intro en' })
    expect(en.bundle.expeditions[0].badge.name).toBe('Outing badge')
  })

  it('stop.title valt terug op de zonenaam (name_<lang>, dan name_nl)', () => {
    const s = Object.fromEntries(nl.bundle.expeditions[0].stops.map((x) => [x.id, x]))
    expect(s['s-zonder-titel'].title).toBe('Zone zone-a')
    expect(s['s-binnen-zone'].title).toBe('Binnen')
    const t = Object.fromEntries(en.bundle.expeditions[0].stops.map((x) => [x.id, x]))
    expect(t['s-zonder-titel'].title).toBe('Zone zone-a (en)')
    expect(t['s-binnen-zone'].title).toBe('Inside')
    expect(t['s-tel-buiten'].title).toBe('Tellen') // geen en: terugval op nl
  })

  it('lokalisatie met terugval op nl voor prompt, options en hint', () => {
    const s = Object.fromEntries(en.bundle.expeditions[0].stops.map((x) => [x.id, x]))
    expect(s['s-zonder-titel'].task).toMatchObject({ prompt: 'Find the penguin', hint: 'Look closely', options: null })
    expect(s['s-binnen-zone'].task.prompt).toBe('Welke kleur?')
    expect(s['s-binnen-zone'].task.options).toEqual(['Red', 'Blauw'])
    expect(s['s-tel-buiten'].task.hint).toBe('Hint')
  })

  it('indoor = stop.indoor of zone.indoor', () => {
    const s = Object.fromEntries(nl.bundle.expeditions[0].stops.map((x) => [x.id, x]))
    expect(s['s-binnen-zone'].indoor).toBe(true) // zone-b is indoor
    expect(s['s-tel-binnen'].indoor).toBe(true) // stop.indoor
    expect(s['s-zonder-titel'].indoor).toBe(false)
  })

  it('answer: choose -> index, count -> getal of null, overige typen null', () => {
    const s = Object.fromEntries(nl.bundle.expeditions[0].stops.map((x) => [x.id, x]))
    expect(s['s-binnen-zone'].task.answer).toBe(1)
    expect(s['s-tel-binnen'].task.answer).toBe(3)
    expect(s['s-tel-buiten'].task.answer).toBeNull()
    expect(s['s-open'].task.answer).toBeNull()
    expect(s['s-zonder-titel'].task.answer).toBeNull()
    expect(s['s-zonder-titel']).toMatchObject({ place_id: 'verblijf-pinguins', species: 'spheniscus-humboldti' })
    expect(s['s-tel-buiten']).toMatchObject({ place_id: null, species: null })
  })

  it('season en minutes worden overgenomen', () => {
    const yaml = expeditionsYaml.replace('  - id: alleen-draft', '  - id: alleen-draft-x').replace('species: casuarius-casuarius', 'species: spheniscus-humboldti')
    const r = buildBundle(parkWith({ ...files, 'expeditions.yaml': yaml }), 'nl', { buildCacheDirs: [], now })
    const e = r.bundle.expeditions.find((x) => x.id === 'alleen-draft-x')!
    expect(e).toMatchObject({ age: '6-10', minutes: 25, season: { from: '10-01', to: '03-31' } })
  })

  it('places in de bundel krijgen de afgeleide zone_id', () => {
    const z = Object.fromEntries(nl.bundle.places.features.map((f) => [f.properties.id, f.properties.zone_id]))
    expect(z['verblijf-pinguins']).toBe('zone-a')
    expect(z['toilet-b']).toBe('zone-b')
    expect(z['verblijf-buiten']).toBe('zone-b') // binnen 30 m van zone-b
    expect(z['verblijf-ver']).toBeUndefined()
  })
})

describe('buildBundle: bingo', () => {
  it('lokaliseert gedrag en filtert soorten op confirmed + foto + niet uitgesloten', () => {
    const dir = parkWith(files)
    const nl = buildBundle(dir, 'nl', { buildCacheDirs: [], now }).bundle.bingo!
    const en = buildBundle(dir, 'en', { buildCacheDirs: [], now }).bundle.bingo!
    expect(nl.sizes).toEqual([9, 16])
    expect(nl.species_share).toBe(0.6)
    expect(nl.behaviours).toEqual([
      { id: 'een-poot', icon: '🦩', label: 'Op een poot', indoor_ok: true },
      { id: 'nest', icon: '🪺', label: 'Een nest', indoor_ok: false },
    ])
    expect(en.behaviours.map((b) => b.label)).toEqual(['On one leg', 'Een nest'])
    // pinguïn: confirmed met foto; struisvogel: draft zonder foto; kasuaris: draft
    expect(nl.species).toEqual(['spheniscus-humboldti'])
  })

  it('exclude haalt soorten weg', () => {
    const dir = parkWith({ ...files, 'bingo.yaml': bingoYaml.replace('exclude: []', 'exclude: [spheniscus-humboldti]') })
    expect(buildBundle(dir, 'nl', { buildCacheDirs: [], now }).bundle.bingo!.species).toEqual([])
  })
})

describe('buildBundle: routes', () => {
  const dir = parkWith(files)
  const nl = buildBundle(dir, 'nl', { buildCacheDirs: [], now })
  const en = buildBundle(dir, 'en', { buildCacheDirs: [], now })

  it('berekent lijn, lengte, minuten en stops; altijd concept', () => {
    const [stroller, kort] = nl.bundle.routes
    expect(stroller).toMatchObject({ id: 'rolstoel', profile: 'stroller', title: 'Kinderwagen', note: 'Let op de borden', concept: true })
    expect(stroller.stops).toEqual([
      { place_id: 'verblijf-pinguins', name: 'Pinguïns', indoor: false },
      { place_id: 'toilet-b', name: 'Toilet B', indoor: true }, // zone-b is indoor
    ])
    // stroller vermijdt de trap: omweg van ca. 134 m
    expect(stroller.length_m).toBeGreaterThan(125)
    expect(stroller.length_m).toBeLessThan(145)
    expect(stroller.minutes).toBe(Math.round((stroller.length_m / 3000) * 60) + 4)
    expect(stroller.svg_points.split(' ').length).toBeGreaterThanOrEqual(4)
    expect(kort.note).toBeNull()
    expect(kort.stops).toHaveLength(3)
    expect(kort.minutes).toBe(Math.round((kort.length_m / 2500) * 60) + 6) // short: 2,5 km/u
  })

  it('waypoint ver van het netwerk: waarschuwing in de build', () => {
    expect(nl.warnings.some((w) => /route kort: waypoint verblijf-ver ligt \d+ m van het padennetwerk/.test(w))).toBe(true)
  })

  it('lokaliseert titel en intro met terugval op nl', () => {
    expect(en.bundle.routes[0]).toMatchObject({ title: 'Pushchair', intro: 'Intro en', note: 'Let op de borden' })
    expect(en.bundle.routes[1]).toMatchObject({ title: 'Kort', intro: 'Kort intro' })
  })

  it('onbekend waypoint wordt weggelaten met waarschuwing; < 2 waypoints laat de route vallen', () => {
    const yaml = `routes:
  - id: stuk
    profile: all
    title: { nl: A }
    intro: { nl: B }
    waypoints: [verblijf-pinguins, bestaat-niet, toilet-b]
  - id: weg
    profile: all
    title: { nl: A }
    intro: { nl: B }
    waypoints: [verblijf-pinguins, bestaat-niet]
`
    const r = buildBundle(parkWith({ ...files, 'routes.yaml': yaml }), 'nl', { buildCacheDirs: [], now })
    expect(r.bundle.routes.map((x) => x.id)).toEqual(['stuk'])
    expect(r.bundle.routes[0].stops).toHaveLength(2)
    expect(r.warnings.some((w) => /waypoint bestaat-niet bestaat niet/.test(w))).toBe(true)
    expect(r.warnings.some((w) => /route weg: minder dan 2/.test(w))).toBe(true)
  })

  it('lege osm-extract: rechte lijnen', () => {
    const r = buildBundle(parkWith({ ...files, 'map/osm-extract.json': '{"elements":[]}' }), 'nl', { buildCacheDirs: [], now })
    expect(r.bundle.routes[0].length_m).toBeGreaterThan(60)
    expect(r.bundle.routes[0].length_m).toBeLessThan(75)
  })
})
