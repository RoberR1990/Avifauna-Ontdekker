// @vitest-environment node
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
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
