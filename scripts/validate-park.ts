// Valideert een parkpakket: schema's + kruisverwijzingen + licentieregels.
// Gebruik: pnpm validate:park [parkDir] [--json]   (standaard parks/avifauna)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import Papa from 'papaparse'
import { parse as parseYaml } from 'yaml'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SCHEMA_DIR = path.resolve(here, '..', 'parks', 'schema')

// ajv-formats is CJS; onder tsx/ESM komt de functie soms op .default
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (a: Ajv2020) => void

export type Level = 'error' | 'warning'
export interface Issue {
  file: string
  level: Level
  message: string
}
export interface FileReport {
  file: string
  errors: string[]
  warnings: string[]
}
export interface Report {
  parkDir: string
  ok: boolean
  errorCount: number
  warningCount: number
  files: FileReport[]
  info: string[]
}

// ---------- schema's ----------
const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true, verbose: true })
addFormats(ajv)
const validators = new Map<string, ValidateFunction>()
function schema(name: string): ValidateFunction {
  let v = validators.get(name)
  if (!v) {
    const json = JSON.parse(readFileSync(path.join(SCHEMA_DIR, `${name}.schema.json`), 'utf8'))
    v = ajv.compile(json)
    validators.set(name, v)
  }
  return v
}

function pathLabel(instancePath: string): string {
  const segs = instancePath.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  let out = ''
  for (const s of segs) out += /^\d+$/.test(s) ? `[${s}]` : out ? `.${s}` : s
  return out
}

function fmtError(e: ErrorObject): string | null {
  const p = pathLabel(e.instancePath)
  const at = p ? `${p}: ` : ''
  const p2 = e.params as Record<string, unknown>
  const val = JSON.stringify(e.data)
  switch (e.keyword) {
    case 'if':
      return null
    case 'required':
      return `${at}ontbrekend veld "${String(p2.missingProperty)}"`
    case 'additionalProperties':
      return `${at}onbekend veld "${String(p2.additionalProperty)}"`
    case 'type':
      return `${at}moet van type ${String(p2.type)} zijn (nu ${val})`
    case 'enum':
      return `${at}waarde ${val} niet toegestaan; kies uit ${(p2.allowedValues as unknown[]).join(', ')}`
    case 'const':
      return `${at}moet ${JSON.stringify(p2.allowedValue)} zijn (nu ${val})`
    case 'pattern':
      return `${at}waarde ${val} heeft een ongeldig formaat (patroon ${String(p2.pattern)})`
    case 'format':
      return `${at}waarde ${val} is geen geldige ${String(p2.format)}`
    case 'minLength':
      return `${at}mag niet leeg zijn`
    case 'minItems':
      return `${at}moet minstens ${String(p2.limit)} element(en) bevatten`
    case 'uniqueItems':
      return `${at}bevat dubbele waarden`
    case 'minimum':
    case 'maximum':
      return `${at}waarde ${val} valt buiten het toegestane bereik (${e.keyword} ${String(p2.limit)})`
    case 'not':
      if (e.schemaPath.includes('facility_type') || e.schemaPath.includes('/properties/else') || e.schemaPath.endsWith('/else/not'))
        return `${at}"facility_type" is alleen toegestaan bij kind "facility"`
      return `${at}veld niet toegestaan in deze combinatie`
    case 'oneOf':
    case 'anyOf':
      return e.schemaPath.includes('geometry')
        ? `${at}geometrie past niet bij kind of is ongeldig (zone = Polygon/MultiPolygon, facility/anchor = Point, enclosure = Point/Polygon)`
        : `${at}past niet bij een toegestaan type`
    default:
      return `${at}${e.message ?? e.keyword}`
  }
}

/** Valideer met schema; geeft leesbare Nederlandse meldingen. `drop` filtert meldingen weg die elders beter gemeld worden. */
function schemaErrors(name: string, data: unknown, drop?: (e: ErrorObject) => boolean): string[] {
  const v = schema(name)
  if (v(data)) return []
  const out = new Set<string>()
  for (const e of v.errors ?? []) {
    if ((e.keyword !== 'oneOf' && e.keyword !== 'anyOf') && e.schemaPath.includes('geometry') && /\/(oneOf|anyOf)\//.test(e.schemaPath)) continue
    if (drop?.(e)) continue
    const m = fmtError(e)
    if (m) out.add(m)
  }
  return [...out]
}

// ---------- verzamelaar ----------
class Collector {
  private files = new Map<string, FileReport>()
  info: string[] = []
  touch(file: string): FileReport {
    let f = this.files.get(file)
    if (!f) this.files.set(file, (f = { file, errors: [], warnings: [] }))
    return f
  }
  error(file: string, msg: string) {
    this.touch(file).errors.push(msg)
  }
  warn(file: string, msg: string) {
    this.touch(file).warnings.push(msg)
  }
  report(parkDir: string): Report {
    const files = [...this.files.values()]
    const errorCount = files.reduce((n, f) => n + f.errors.length, 0)
    const warningCount = files.reduce((n, f) => n + f.warnings.length, 0)
    return { parkDir, ok: errorCount === 0, errorCount, warningCount, files, info: this.info }
  }
}

// ---------- helpers ----------
const SLUG_RE = /^[a-z]+-[a-z][a-z-]*$/
export function slugFor(scientificName: string): string {
  return scientificName.trim().toLowerCase().replace(/\s+/g, '-')
}

function readText(p: string): string {
  return readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
}

function readJson(c: Collector, file: string, abs: string): unknown | undefined {
  try {
    return JSON.parse(readText(abs))
  } catch (e) {
    c.error(file, `ongeldige JSON: ${(e as Error).message}`)
    return undefined
  }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const CSV_COLUMNS = ['scientific_name', 'slug', 'name_nl', 'zone_id', 'place_id', 'last_seen', 'wikidata_qid', 'status', 'notes']
const CSV_REQUIRED = ['scientific_name', 'slug', 'status']

// ---------- hoofdfunctie ----------
export function validatePark(parkDirArg: string): Report {
  const parkDir = path.resolve(parkDirArg)
  const c = new Collector()
  const rel = (p: string) => path.relative(parkDir, p).split(path.sep).join('/')

  if (!existsSync(parkDir) || !statSync(parkDir).isDirectory()) {
    c.error('(parkmap)', `map niet gevonden: ${parkDirArg}`)
    return c.report(parkDirArg)
  }

  // ----- park.json -----
  let languages: string[] = ['nl']
  const parkPath = path.join(parkDir, 'park.json')
  c.touch('park.json')
  if (!existsSync(parkPath)) c.error('park.json', 'verplicht bestand ontbreekt')
  else {
    const park = readJson(c, 'park.json', parkPath) as Record<string, unknown> | undefined
    if (park) {
      for (const m of schemaErrors('park', park)) c.error('park.json', m)
      if (Array.isArray(park.languages)) languages = park.languages as string[]
      const dl = park.default_language
      if (typeof dl === 'string' && !languages.includes(dl)) c.error('park.json', `default_language "${dl}" staat niet in languages`)
      for (const key of ['disclaimer_bar', 'footer']) {
        const v = park[key]
        if (v && typeof v === 'object')
          for (const l of languages) if (!(l in (v as object))) c.warn('park.json', `${key}: vertaling voor "${l}" ontbreekt`)
      }
      const g = park.map_georef
      if (typeof g === 'string' && !existsSync(path.join(parkDir, g))) c.error('park.json', `map_georef verwijst naar ontbrekend bestand "${g}"`)
    }
  }

  // ----- places.geojson (eerst, voor kruisverwijzingen) -----
  const places = new Map<string, { kind: string; zone_id?: string }>()
  const placesPath = path.join(parkDir, 'places.geojson')
  c.touch('places.geojson')
  if (!existsSync(placesPath)) c.error('places.geojson', 'verplicht bestand ontbreekt')
  else {
    const gj = readJson(c, 'places.geojson', placesPath) as { features?: { properties?: Record<string, unknown> }[] } | undefined
    if (gj) {
      for (const m of schemaErrors('places', gj)) c.error('places.geojson', m)
      const seen = new Set<string>()
      for (const [i, f] of (Array.isArray(gj.features) ? gj.features : []).entries()) {
        const pr = f?.properties
        if (!pr || typeof pr.id !== 'string') continue
        if (seen.has(pr.id)) c.error('places.geojson', `features[${i}]: dubbele id "${pr.id}"`)
        seen.add(pr.id)
        places.set(pr.id, { kind: String(pr.kind), zone_id: typeof pr.zone_id === 'string' ? pr.zone_id : undefined })
      }
      for (const [i, f] of (Array.isArray(gj.features) ? gj.features : []).entries()) {
        const pr = f?.properties
        if (!pr || typeof pr.zone_id !== 'string') continue
        const z = places.get(pr.zone_id)
        if (!z) c.error('places.geojson', `features[${i}] ("${String(pr.id)}"): zone_id "${pr.zone_id}" bestaat niet`)
        else if (z.kind !== 'zone') c.error('places.geojson', `features[${i}] ("${String(pr.id)}"): zone_id "${pr.zone_id}" is geen zone (kind=${z.kind})`)
      }
    }
  }

  // ----- species.csv -----
  const slugs = new Set<string>()
  const speciesRows: Record<string, string>[] = []
  const csvPath = path.join(parkDir, 'species.csv')
  c.touch('species.csv')
  if (!existsSync(csvPath)) c.error('species.csv', 'verplicht bestand ontbreekt')
  else {
    const parsed = Papa.parse<Record<string, string>>(readText(csvPath), { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() })
    const header = parsed.meta.fields ?? []
    for (const col of CSV_REQUIRED) if (!header.includes(col)) c.error('species.csv', `kolom "${col}" ontbreekt in de header`)
    for (const col of header) if (!CSV_COLUMNS.includes(col)) c.error('species.csv', `onbekende kolom "${col}" in de header`)
    for (const e of parsed.errors) c.error('species.csv', `rij ${(e.row ?? 0) + 2}: ${e.message}`)
    if (header.length > 0 && CSV_REQUIRED.every((k) => header.includes(k))) {
      const seenSlug = new Map<string, number>()
      const seenName = new Map<string, number>()
      for (const [i, raw] of parsed.data.entries()) {
        const line = i + 2
        const row: Record<string, string> = {}
        for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && v.trim() !== '') row[k] = v.trim()
        speciesRows.push(row)
        const label = `rij ${line}${row.slug ? ` (${row.slug})` : ''}`
        for (const m of schemaErrors('species-row', row)) c.error('species.csv', `${label}: ${m}`)
        if (row.scientific_name && row.slug && row.slug !== slugFor(row.scientific_name))
          c.error('species.csv', `${label}: slug "${row.slug}" hoort bij "${slugFor(row.scientific_name)}" (kleine letters, spatie wordt "-")`)
        if (row.slug) {
          if (seenSlug.has(row.slug)) c.error('species.csv', `${label}: dubbele slug (ook in rij ${seenSlug.get(row.slug)})`)
          else seenSlug.set(row.slug, line)
          slugs.add(row.slug)
        }
        if (row.scientific_name) {
          if (seenName.has(row.scientific_name)) c.error('species.csv', `${label}: dubbele wetenschappelijke naam (ook in rij ${seenName.get(row.scientific_name)})`)
          else seenName.set(row.scientific_name, line)
        }
        if (row.zone_id) {
          const z = places.get(row.zone_id)
          if (!z) c.error('species.csv', `${label}: zone_id "${row.zone_id}" bestaat niet in places.geojson`)
          else if (z.kind !== 'zone') c.error('species.csv', `${label}: zone_id "${row.zone_id}" is geen zone (kind=${z.kind})`)
        }
        if (row.place_id) {
          const pl = places.get(row.place_id)
          if (!pl) c.error('species.csv', `${label}: place_id "${row.place_id}" bestaat niet in places.geojson`)
          else if (pl.kind !== 'enclosure') c.error('species.csv', `${label}: place_id "${row.place_id}" is geen verblijf (kind=${pl.kind})`)
        }
      }
      if (speciesRows.length === 0) c.warn('species.csv', 'geen soorten (alleen header)')
    }
  }

  // ----- expeditions.yaml -----
  const expPath = path.join(parkDir, 'expeditions.yaml')
  c.touch('expeditions.yaml')
  if (!existsSync(expPath)) c.warn('expeditions.yaml', 'bestand ontbreekt (optioneel)')
  else {
    let data: unknown
    try {
      data = parseYaml(readText(expPath))
    } catch (e) {
      c.error('expeditions.yaml', `ongeldige YAML: ${(e as Error).message}`)
    }
    if (data !== undefined) {
      for (const m of schemaErrors('expeditions', data)) c.error('expeditions.yaml', m)
      const exps = (data as { expeditions?: unknown })?.expeditions
      if (Array.isArray(exps)) {
        const expIds = new Set<string>()
        const badgeIds = new Set<string>()
        for (const [i, ex] of exps.entries()) {
          if (!ex || typeof ex !== 'object') continue
          const e = ex as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
          const el = `expeditions[${i}]${e.id ? ` (${e.id})` : ''}`
          if (typeof e.id === 'string') {
            if (expIds.has(e.id)) c.error('expeditions.yaml', `${el}: dubbele expeditie-id`)
            expIds.add(e.id)
          }
          if (typeof e.badge?.id === 'string') {
            if (badgeIds.has(e.badge.id)) c.error('expeditions.yaml', `${el}: dubbele badge-id "${e.badge.id}"`)
            badgeIds.add(e.badge.id)
          }
          const stopIds = new Set<string>()
          for (const [j, st] of (Array.isArray(e.stops) ? e.stops : []).entries()) {
            if (!st || typeof st !== 'object') continue
            const sl = `${el}.stops[${j}]${st.id ? ` (${st.id})` : ''}`
            if (typeof st.id === 'string') {
              if (stopIds.has(st.id)) c.error('expeditions.yaml', `${sl}: dubbele stop-id`)
              stopIds.add(st.id)
            }
            if (typeof st.zone_id === 'string') {
              const z = places.get(st.zone_id)
              if (!z) c.error('expeditions.yaml', `${sl}: zone_id "${st.zone_id}" bestaat niet in places.geojson`)
              else if (z.kind !== 'zone') c.error('expeditions.yaml', `${sl}: zone_id "${st.zone_id}" is geen zone (kind=${z.kind})`)
            }
            if (typeof st.place_id === 'string') {
              const pl = places.get(st.place_id)
              if (!pl) c.error('expeditions.yaml', `${sl}: place_id "${st.place_id}" bestaat niet in places.geojson`)
              else if (pl.zone_id && pl.zone_id !== st.zone_id && pl.kind !== 'zone')
                c.warn('expeditions.yaml', `${sl}: place_id "${st.place_id}" ligt in zone "${pl.zone_id}", niet in "${String(st.zone_id)}"`)
            }
            if (typeof st.species === 'string' && !slugs.has(st.species)) c.error('expeditions.yaml', `${sl}: soort "${st.species}" bestaat niet in species.csv`)
            const t = st.task
            if (t?.type === 'choose' && Array.isArray(t.options) && typeof t.answer === 'number' && t.answer >= t.options.length)
              c.error('expeditions.yaml', `${sl}: answer ${t.answer} wijst buiten options (${t.options.length} opties)`)
          }
        }
      }
    }
  }

  // ----- programme.json -----
  const progPath = path.join(parkDir, 'programme.json')
  c.touch('programme.json')
  if (!existsSync(progPath)) c.warn('programme.json', 'bestand ontbreekt (optioneel)')
  else {
    const prog = readJson(c, 'programme.json', progPath) as { items?: Record<string, unknown>[] } | undefined
    if (prog) {
      for (const m of schemaErrors('programme', prog)) c.error('programme.json', m)
      for (const [i, it] of (Array.isArray(prog.items) ? prog.items : []).entries()) {
        const il = `items[${i}]`
        if (typeof it?.place_id === 'string' && !places.has(it.place_id)) c.error('programme.json', `${il}: place_id "${it.place_id}" bestaat niet in places.geojson`)
        if (Array.isArray(it?.species))
          for (const s of it.species) if (typeof s === 'string' && !slugs.has(s)) c.error('programme.json', `${il}: soort "${s}" bestaat niet in species.csv`)
      }
    }
  }

  // ----- texts -----
  const textsDir = path.join(parkDir, 'texts')
  c.touch('texts/')
  if (!existsSync(textsDir)) c.warn('texts/', 'map ontbreekt (optioneel)')
  else {
    const covered = new Map<string, Set<string>>()
    for (const abs of walk(textsDir).filter((p) => p.endsWith('.md'))) {
      const file = rel(abs)
      const parts = file.split('/') // texts/<lang>/<slug>.md
      if (parts.length !== 3) {
        c.error(file, 'verwacht pad texts/<taal>/<slug>.md')
        continue
      }
      const dirLang = parts[1]
      const nameSlug = parts[2].replace(/\.md$/, '')
      c.touch(file)
      if (!languages.includes(dirLang)) c.error(file, `taalmap "${dirLang}" staat niet in languages van park.json`)
      if (!SLUG_RE.test(nameSlug)) c.error(file, `bestandsnaam "${parts[2]}" is geen geldige slug`)
      else if (!slugs.has(nameSlug)) c.error(file, `soort "${nameSlug}" bestaat niet in species.csv`)
      const parsed = parseText(readText(abs))
      if ('error' in parsed) {
        c.error(file, parsed.error)
        continue
      }
      for (const m of schemaErrors('text-frontmatter', parsed.front)) c.error(file, `frontmatter ${m}`)
      const fm = parsed.front as { slug?: string; lang?: string; reviewed?: boolean }
      if (fm.slug && fm.slug !== nameSlug) c.error(file, `frontmatter slug "${fm.slug}" komt niet overeen met bestandsnaam "${nameSlug}"`)
      if (fm.lang && fm.lang !== dirLang) c.error(file, `frontmatter lang "${fm.lang}" komt niet overeen met map "${dirLang}"`)
      for (const m of parsed.sectionIssues) c.error(file, m)
      for (const [name, body] of Object.entries(parsed.sections)) {
        if (body.trim() === '') {
          if (fm.reviewed === true) c.error(file, `sectie "## ${name}" is leeg terwijl reviewed: true`)
          else c.warn(file, `sectie "## ${name}" is nog leeg`)
        }
      }
      if (!covered.has(dirLang)) covered.set(dirLang, new Set())
      covered.get(dirLang)!.add(nameSlug)
    }
    for (const [l, set] of covered) c.info.push(`teksten ${l}: ${set.size} van ${slugs.size} soorten`)
  }

  // ----- media/attributions.json -----
  const attrPath = path.join(parkDir, 'media', 'attributions.json')
  c.touch('media/attributions.json')
  const attributedFiles = new Set<string>()
  if (!existsSync(attrPath)) c.warn('media/attributions.json', 'bestand ontbreekt (optioneel)')
  else {
    const attrs = readJson(c, 'media/attributions.json', attrPath)
    if (attrs !== undefined) {
      const customLicense = new Set<number>()
      if (Array.isArray(attrs)) {
        for (const [i, r] of attrs.entries()) {
          if (!r || typeof r !== 'object') continue
          const a = r as Record<string, unknown>
          const label = `[${i}]${typeof a.file === 'string' ? ` (${a.file})` : ''}`
          const file = typeof a.file === 'string' ? a.file : ''
          const inCache = file.startsWith('build-cache/')
          if (typeof a.license === 'string') {
            const lic = a.license
            if (/(^|[-_\s])ND([-_.\s]|$)/i.test(lic)) {
              c.error('media/attributions.json', `${label}: licentie "${lic}" bevat ND (geen bewerkingen) en is niet toegestaan`)
              customLicense.add(i)
            } else if (/^CC-BY-NC(-|$)/i.test(lic) && !/^CC-BY-NC-SA-/i.test(lic)) {
              c.error('media/attributions.json', `${label}: licentie "${lic}" (NC zonder SA) is niet toegestaan`)
              customLicense.add(i)
            } else if (/^CC-BY-NC-SA-/i.test(lic)) {
              const problems: string[] = []
              if (a.kind !== 'audio') problems.push('kind moet "audio" zijn')
              if (a.source !== 'xeno-canto') problems.push('source moet "xeno-canto" zijn')
              if (a.in_repo !== false) problems.push('in_repo moet false zijn')
              if (!inCache) problems.push('bestand moet onder build-cache/ staan')
              if (problems.length) {
                c.error('media/attributions.json', `${label}: NC-licentie "${lic}" alleen toegestaan voor xeno-canto-audio buiten de repo: ${problems.join('; ')}`)
                customLicense.add(i)
              }
            } else if (!/^(CC0-1\.0|PDM(-1\.0)?|LicenseRef-PD|CC-BY-[0-9]\.[0-9]|CC-BY-SA-[0-9]\.[0-9])$/.test(lic)) {
              c.error('media/attributions.json', `${label}: licentie "${lic}" staat niet op de toegestane lijst (CC0-1.0, PDM, LicenseRef-PD, CC-BY-*, CC-BY-SA-*)`)
              customLicense.add(i)
            }
          }
          if (typeof a.in_repo === 'boolean' && file) {
            if (a.in_repo && inCache) c.error('media/attributions.json', `${label}: in_repo is true maar het bestand staat onder build-cache/`)
            if (!a.in_repo && !inCache && !customLicense.has(i)) c.error('media/attributions.json', `${label}: in_repo is false maar het bestand staat niet onder build-cache/`)
            if (a.in_repo && !inCache) {
              attributedFiles.add(file)
              if (!existsSync(path.join(parkDir, file))) c.error('media/attributions.json', `${label}: bestand bestaat niet in het parkpakket`)
            }
          }
          if (typeof a.slug === 'string' && !slugs.has(a.slug)) c.error('media/attributions.json', `${label}: soort "${a.slug}" bestaat niet in species.csv`)
        }
      }
      // allOf-regels worden hierboven met eigen meldingen afgedekt
      const drop = (e: ErrorObject) => /\/allOf\/\d+\/(then|else)/.test(e.schemaPath) || e.keyword === 'if' || (e.instancePath.endsWith('/license') && e.keyword === 'pattern')
      for (const m of schemaErrors('attributions', attrs, drop)) c.error('media/attributions.json', m)
      // licentiepatroonfouten voor records die ik niet zelf heb gemeld (bv. ontbrekend veld) blijven via de schema-meldingen
    }
  }
  // media-bestanden zonder attributie
  for (const abs of walk(path.join(parkDir, 'media'))) {
    const f = rel(abs)
    if (f === 'media/attributions.json' || path.basename(f).startsWith('.')) continue
    if (!attributedFiles.has(f)) c.error('media/attributions.json', `bestand "${f}" heeft geen attributie-record`)
  }

  const report = c.report(parkDirArg)
  c.info.push(`${speciesRows.length} soort(en), ${places.size} plek(ken)`)
  return report
}

// ---------- tekstbestanden ----------
interface ParsedText {
  front: unknown
  sections: Record<string, string>
  sectionIssues: string[]
}
function parseText(raw: string): ParsedText | { error: string } {
  const src = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!src.startsWith('---\n')) return { error: 'frontmatter ontbreekt (bestand moet met --- beginnen)' }
  const end = src.indexOf('\n---', 4)
  if (end === -1) return { error: 'frontmatter niet afgesloten met ---' }
  let front: unknown
  try {
    front = parseYaml(src.slice(4, end))
  } catch (e) {
    return { error: `ongeldige frontmatter-YAML: ${(e as Error).message}` }
  }
  const body = src.slice(end + 4).replace(/^[^\n]*\n?/, '') // rest van de ---regel overslaan
  const sectionIssues: string[] = []
  const sections: Record<string, string> = {}
  const order: string[] = []
  let current: string | null = null
  const pre: string[] = []
  const buf: string[] = []
  const flush = () => {
    if (current !== null) sections[current] = buf.join('\n').trim()
    buf.length = 0
  }
  for (const line of body.split('\n')) {
    const m = /^##\s+(.*?)\s*$/.exec(line)
    if (m && !line.startsWith('###')) {
      flush()
      current = m[1]
      if (order.includes(current)) sectionIssues.push(`sectie "## ${current}" komt dubbel voor`)
      order.push(current)
    } else if (current === null) pre.push(line)
    else buf.push(line)
  }
  flush()
  if (pre.join('\n').trim() !== '') sectionIssues.push('tekst buiten een sectie (vóór de eerste ## kop)')
  const known = ['kind', 'b1', 'kenner']
  for (const n of order) if (!known.includes(n)) sectionIssues.push(`onbekende sectie "## ${n}" (toegestaan: ## kind, ## b1, ## kenner)`)
  for (const n of ['kind', 'b1']) if (!order.includes(n)) sectionIssues.push(`verplichte sectie "## ${n}" ontbreekt`)
  const expected = known.filter((k) => order.includes(k))
  const actual = order.filter((k) => known.includes(k))
  if (new Set(order).size === order.length && expected.join() !== actual.join()) sectionIssues.push('volgorde van de secties moet kind, b1, kenner zijn')
  return { front, sections, sectionIssues }
}

// ---------- uitvoer ----------
export function formatReport(r: Report): string {
  const lines: string[] = [`Parkpakket valideren: ${r.parkDir}`, '']
  for (const f of r.files) {
    lines.push(f.file)
    if (f.errors.length === 0 && f.warnings.length === 0) lines.push('  OK')
    for (const e of f.errors) lines.push(`  FOUT          ${e}`)
    for (const w of f.warnings) lines.push(`  WAARSCHUWING  ${w}`)
  }
  lines.push('')
  for (const i of r.info) lines.push(`Info: ${i}`)
  lines.push(r.ok ? `Resultaat: GOED (${r.warningCount} waarschuwing(en))` : `Resultaat: AFGEKEURD, ${r.errorCount} fout(en), ${r.warningCount} waarschuwing(en)`)
  return lines.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const dir = args.find((a) => !a.startsWith('--')) ?? 'parks/avifauna'
  const report = validatePark(dir)
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report))
  process.exit(report.ok ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
