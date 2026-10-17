// @vitest-environment node
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { slugFor, validatePark } from './validate-park'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.join(here, 'fixtures')
const tmpRoots: string[] = []

/** Kopieert het goede park en legt de bestanden van het foute geval eroverheen. */
function badPark(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'avifauna-'))
  tmpRoots.push(dir)
  cpSync(path.join(fixtures, 'good'), dir, { recursive: true })
  cpSync(path.join(fixtures, 'bad', name), dir, { recursive: true })
  return dir
}

afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true })
})

function errorsOf(dir: string, file: string): string[] {
  return validatePark(dir).files.find((f) => f.file === file)?.errors ?? []
}

describe('validatePark', () => {
  it('keurt het goede fixture-park goed (incl. NC-audio buiten de repo)', () => {
    const r = validatePark(path.join(fixtures, 'good'))
    expect(r.files.flatMap((f) => f.errors)).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('keurt het startpakket parks/avifauna goed', () => {
    const r = validatePark(path.join(here, '..', 'parks', 'avifauna'))
    expect(r.files.flatMap((f) => f.errors)).toEqual([])
  })

  const cases: [string, string, RegExp][] = [
    ['nd-licence', 'media/attributions.json', /ND.*niet toegestaan/],
    ['nc-photo', 'media/attributions.json', /alleen toegestaan voor xeno-canto-audio.*kind moet "audio"/],
    ['nc-no-sa', 'media/attributions.json', /NC zonder SA/],
    ['nc-audio-in-repo', 'media/attributions.json', /in_repo moet false zijn/],
    ['dangling-zone', 'species.csv', /zone_id "zone-bestaat-niet" bestaat niet/],
    ['duplicate-slug', 'species.csv', /dubbele slug/],
    ['bad-slug', 'species.csv', /slug "Spheniscus_Humboldti" hoort bij "spheniscus-humboldti"/],
    ['text-unknown-species', 'texts/nl/pica-pica.md', /soort "pica-pica" bestaat niet in species.csv/],
    ['facts-unknown-slug', 'facts/pica-pica.yaml', /soort "pica-pica" bestaat niet in species.csv/],
    ['facts-bad-range', 'facts/spheniscus-humboldti.yaml', /length_cm: minimum 70 is groter dan maximum 56/],
    ['facts-bad-enum', 'facts/spheniscus-humboldti.yaml', /continents\[0\]: waarde "atlantis" niet toegestaan/],
    ['facts-no-sources', 'facts/spheniscus-humboldti.yaml', /sources: moet minstens 1 element/],
    ['park-url-invalid', 'species.csv', /park_url: waarde "niet-een-url" is geen geldige uri/],
    ['bad-time', 'programme.json', /time: waarde "25:61" heeft een ongeldig formaat/],
  ]
  for (const [name, file, re] of cases) {
    it(`fout geval ${name}`, () => {
      const dir = badPark(name)
      const errs = errorsOf(dir, file)
      expect(errs.some((e) => re.test(e)), errs.join('\n') || '(geen fouten)').toBe(true)
      expect(validatePark(dir).ok).toBe(false)
    })
  }

  it('slugFor volgt de contractregel', () => {
    expect(slugFor('Spheniscus humboldti')).toBe('spheniscus-humboldti')
  })
})

/** Kopieert het goede park en schrijft/overschrijft de opgegeven bestanden (pad -> inhoud). */
function parkWith(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'avifauna-'))
  tmpRoots.push(dir)
  cpSync(path.join(fixtures, 'good'), dir, { recursive: true })
  for (const [f, content] of Object.entries(files)) writeFileSync(path.join(dir, f), content)
  return dir
}

const stopYaml = (extra: string, task = 'type: find\n          prompt: { nl: Zoek }') => `expeditions:
  - id: uitje
    title: { nl: Uitje }
    intro: { nl: Intro }
    badge: { id: badge-uitje, name: { nl: Uitje }, icon: x }
    stops:
      - id: stop-1
        zone_id: zone-voorbeeld
        ${extra}
        task:
          ${task}
`

describe('validatePark: fase 2 (expedities, bingo, routes)', () => {
  const hasError = (dir: string, file: string, re: RegExp) => {
    const errs = errorsOf(dir, file)
    expect(errs.some((e) => re.test(e)), errs.join('\n') || '(geen fouten)').toBe(true)
  }

  it('expeditie met niet-confirmed soort is een fout', () => {
    const dir = parkWith({ 'expeditions.yaml': stopYaml('species: casuarius-casuarius') })
    hasError(dir, 'expeditions.yaml', /status "draft".*confirmed/)
  })

  it('binnen-stop (indoor: true) moet choose of count met answer zijn', () => {
    const dir = parkWith({ 'expeditions.yaml': stopYaml('indoor: true') })
    hasError(dir, 'expeditions.yaml', /binnen-stop.*choose of count/)
    const noAnswer = parkWith({ 'expeditions.yaml': stopYaml('indoor: true', 'type: count\n          prompt: { nl: Tel }') })
    hasError(noAnswer, 'expeditions.yaml', /binnen-stop.*zonder answer/)
    const ok = parkWith({ 'expeditions.yaml': stopYaml('indoor: true', 'type: count\n          prompt: { nl: Tel }\n          answer: 4') })
    expect(errorsOf(ok, 'expeditions.yaml')).toEqual([])
  })

  it('binnen-stop via zone met indoor: true', () => {
    const places = readFileSync(path.join(fixtures, 'good', 'places.geojson'), 'utf8').replace(
      '"kind": "zone", "name_nl": "Voorbeeldzone"',
      '"kind": "zone", "indoor": true, "name_nl": "Voorbeeldzone"',
    )
    expect(places).toContain('"indoor": true, "name_nl": "Voorbeeldzone"')
    const dir = parkWith({ 'places.geojson': places, 'expeditions.yaml': stopYaml('species: spheniscus-humboldti') })
    hasError(dir, 'expeditions.yaml', /binnen-stop.*choose of count/)
  })

  it('place_id gebruikt de afgeleide zone', () => {
    // verblijf-voorbeeld zonder zone_id: de afgeleide zone (punt-in-polygoon) is zone-voorbeeld = stop.zone_id.
    const places = JSON.parse(readFileSync(path.join(fixtures, 'good', 'places.geojson'), 'utf8'))
    delete places.features[1].properties.zone_id
    const dir = parkWith({
      'places.geojson': JSON.stringify(places),
      'expeditions.yaml': stopYaml('place_id: verblijf-voorbeeld'),
    })
    const r = validatePark(dir).files.find((f) => f.file === 'expeditions.yaml')!
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
    // Andere zone in de stop: nu wel een waarschuwing, op basis van de afgeleide zone.
    const places2 = JSON.parse(JSON.stringify(places))
    places2.features.push({
      type: 'Feature',
      properties: { id: 'zone-ander', kind: 'zone', name_nl: 'Ander', source: 'manual' },
      geometry: { type: 'Polygon', coordinates: [[[4.6, 52.1], [4.601, 52.1], [4.601, 52.101], [4.6, 52.101], [4.6, 52.1]]] },
    })
    const dir2 = parkWith({
      'places.geojson': JSON.stringify(places2),
      'expeditions.yaml': stopYaml('place_id: verblijf-voorbeeld').replace('zone_id: zone-voorbeeld', 'zone_id: zone-ander'),
    })
    const r2 = validatePark(dir2).files.find((f) => f.file === 'expeditions.yaml')!
    expect(r2.warnings.some((w) => /ligt in zone "zone-voorbeeld"/.test(w)), r2.warnings.join('\n')).toBe(true)
  })

  it('bingo: minstens 16 behaviours bij size 16', () => {
    const dir = parkWith({ 'bingo.yaml': 'sizes: [9, 16]\nspecies_share: 0.5\nbehaviours:\n  - { id: a, icon: x, label: { nl: A } }\n' })
    hasError(dir, 'bingo.yaml', /minstens 16/)
    const nine = parkWith({ 'bingo.yaml': 'sizes: [9]\nspecies_share: 0.5\nbehaviours:\n  - { id: a, icon: x, label: { nl: A } }\n' })
    expect(errorsOf(nine, 'bingo.yaml')).toEqual([])
  })

  it('bingo: dubbele id, species_share buiten 0..1, onbekende exclude', () => {
    const base = readFileSync(path.join(fixtures, 'good', 'bingo.yaml'), 'utf8')
    hasError(parkWith({ 'bingo.yaml': base.replace('id: zwemmen', 'id: een-poot') }), 'bingo.yaml', /dubbele id "een-poot"/)
    hasError(parkWith({ 'bingo.yaml': base.replace('species_share: 0.6', 'species_share: 1.5') }), 'bingo.yaml', /species_share/)
    hasError(parkWith({ 'bingo.yaml': base.replace('[casuarius-casuarius]', '[pica-pica]') }), 'bingo.yaml', /soort "pica-pica" bestaat niet/)
  })

  it('routes: onbekend waypoint, 1 waypoint, dubbele id', () => {
    const route = (id: string, wp: string) => `  - id: ${id}\n    profile: all\n    title: { nl: T }\n    intro: { nl: I }\n    waypoints: ${wp}\n`
    hasError(parkWith({ 'routes.yaml': 'routes:\n' + route('r1', '[verblijf-voorbeeld, bestaat-niet]') }), 'routes.yaml', /waypoint "bestaat-niet" bestaat niet/)
    hasError(parkWith({ 'routes.yaml': 'routes:\n' + route('r1', '[verblijf-voorbeeld]') }), 'routes.yaml', /minstens 2/)
    hasError(
      parkWith({ 'routes.yaml': 'routes:\n' + route('r1', '[verblijf-voorbeeld, toilet-voorbeeld]') + route('r1', '[verblijf-voorbeeld, toilet-voorbeeld]') }),
      'routes.yaml',
      /dubbele route-id/,
    )
  })

  it('stop.title, age en minutes worden door het schema geaccepteerd; onbekende age niet', () => {
    const ok = parkWith({ 'expeditions.yaml': stopYaml('title: { nl: Kort }').replace('    intro:', '    age: 6-10\n    minutes: 30\n    intro:') })
    expect(errorsOf(ok, 'expeditions.yaml')).toEqual([])
    const bad = parkWith({ 'expeditions.yaml': stopYaml('').replace('    intro:', '    age: baby\n    intro:') })
    hasError(bad, 'expeditions.yaml', /age/)
  })
})
