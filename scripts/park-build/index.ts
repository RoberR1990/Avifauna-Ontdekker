// Bouwt de ParkBundle (src/data/types.ts) uit een parkpakket. Zie docs/FASE-1.md §1.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import Papa from 'papaparse'
import { parse as parseYaml } from 'yaml'
import type {
  AudioRef,
  BundleAttribution,
  BundleSpecies,
  Facts,
  Georef,
  Lang,
  ParkBundle,
  PhotoRef,
  SizeClass,
  SpeciesTextBundle,
} from '../../src/data/types.ts'
import type {
  AppData,
  AppSpecies,
  Attribution,
  ParkJson,
  PlacesCollection,
  Programme,
  SpeciesRow,
} from '../../src/park/types.ts'

export interface BuildOptions {
  /** Mappen waarin build-cache-bestanden (NC-audio) gezocht worden; eerste treffer wint. */
  buildCacheDirs?: string[]
  /** Vast tijdstip voor `generated` (tests). */
  now?: string
}

export interface BundleFile {
  /** Absoluut bronpad. */
  from: string
  /** Doelpad relatief aan base, bv. "park/media/photos/x.webp". */
  to: string
}

export interface BuildResult {
  bundle: ParkBundle
  files: BundleFile[]
  warnings: string[]
}

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

/**
 * Zoekpaden voor de build-cache: env AVIFAUNA_BUILD_CACHE, dan <repo>/build-cache,
 * dan env AVIFAUNA_BUILD_CACHE_FALLBACK (standaard D:\Avifauna\build-cache, de hoofdcheckout).
 */
export function defaultBuildCacheDirs(): string[] {
  const dirs = [
    process.env.AVIFAUNA_BUILD_CACHE,
    join(repoRoot, 'build-cache'),
    process.env.AVIFAUNA_BUILD_CACHE_FALLBACK ?? 'D:\\Avifauna\\build-cache',
  ].filter((d): d is string => !!d)
  return dirs.filter((d) => existsSync(d))
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as T
}

function readJsonIfExists<T>(path: string): T | null {
  return existsSync(path) ? readJson<T>(path) : null
}

const nullIfEmpty = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null)

function midpoint(r: [number, number] | null | undefined): number | null {
  return r ? (r[0] + r[1]) / 2 : null
}

export function sizeClassFor(facts: Facts | null): SizeClass | null {
  const m = midpoint(facts?.height_cm) ?? midpoint(facts?.length_cm)
  if (m == null) return null
  if (m < 30) return 'small'
  if (m < 60) return 'medium'
  if (m < 100) return 'large'
  return 'giant'
}

function parseFacts(path: string, slug: string): Facts | null {
  if (!existsSync(path)) return null
  const raw = parseYaml(readFileSync(path, 'utf8')) as Partial<Facts> | null
  if (!raw) return null
  return {
    slug,
    reviewed: raw.reviewed === true,
    is_bird: raw.is_bird !== false,
    length_cm: raw.length_cm ?? null,
    height_cm: raw.height_cm ?? null,
    mass_g: raw.mass_g ?? null,
    wingspan_cm: raw.wingspan_cm ?? null,
    lifespan_wild_y: raw.lifespan_wild_y ?? null,
    lifespan_captivity_y: raw.lifespan_captivity_y ?? null,
    clutch: raw.clutch ?? null,
    incubation_days: raw.incubation_days ?? null,
    continents: raw.continents ?? [],
    range: raw.range ?? null,
    range_center: raw.range_center ?? null,
    habitat: raw.habitat ?? null,
    diet: raw.diet ?? null,
    colors: raw.colors ?? [],
    iucn_trend: raw.iucn_trend ?? 'unknown',
    threats: raw.threats ?? null,
    wow: raw.wow ?? null,
    sources: raw.sources ?? [],
  }
}

function parseText(parkDir: string, lang: Lang, slug: string): SpeciesTextBundle | null {
  const langs: Lang[] = lang === 'nl' ? ['nl'] : [lang, 'nl']
  for (const l of langs) {
    const path = join(parkDir, 'texts', l, `${slug}.md`)
    if (!existsSync(path)) continue
    const { data, content } = matter(readFileSync(path, 'utf8'))
    const sections: Record<string, string> = {}
    let current: string | null = null
    for (const line of content.split(/\r?\n/)) {
      const h = /^##\s+(\S+)\s*$/.exec(line)
      if (h) {
        current = h[1].toLowerCase()
        sections[current] = ''
      } else if (current) {
        sections[current] += line + '\n'
      }
    }
    const sec = (k: string) => (sections[k]?.trim() ? sections[k].trim() : null)
    return {
      lang: l,
      kind: sec('kind'),
      b1: sec('b1'),
      kenner: sec('kenner'),
      sources: (data.sources as { title: string; url: string }[] | undefined) ?? [],
      reviewed: data.reviewed === true,
    }
  }
  return null
}

function fileSize(path: string): number {
  return statSync(path).size
}

export function buildBundle(parkDir: string, lang: Lang, opts: BuildOptions = {}): BuildResult {
  parkDir = resolve(parkDir)
  const cacheDirs = opts.buildCacheDirs ?? defaultBuildCacheDirs()
  const warnings: string[] = []
  const files = new Map<string, BundleFile>()
  const addFile = (from: string, to: string) => {
    if (!files.has(to)) files.set(to, { from, to })
  }

  const park = readJson<ParkJson>(join(parkDir, 'park.json'))

  // Soortenlijst (species.csv)
  const csvText = readFileSync(join(parkDir, 'species.csv'), 'utf8').replace(/^\uFEFF/, '')
  const rows = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true }).data

  // Goud (optioneel)
  const gold = readJsonIfExists<AppData>(join(parkDir, 'data', `app-data.${lang}.json`))
  const goldBySlug = new Map<string, AppSpecies>((gold?.species ?? []).map((s) => [s.slug, s]))

  // Attributies
  const rawAttr = readJsonIfExists<Attribution[]>(join(parkDir, 'media', 'attributions.json')) ?? []
  const goldAttr = gold?.attributions ?? null
  const resolveAttr = (ref: { file: string; attribution_index: number }, slug: string, kind: string): Attribution | null =>
    rawAttr.find((a) => a.file === ref.file) ??
    rawAttr.find((a) => a.slug === slug && a.kind === kind && basename(a.file) === basename(ref.file)) ??
    goldAttr?.[ref.attribution_index] ??
    rawAttr[ref.attribution_index] ??
    null

  const outAttr: BundleAttribution[] = []
  const attrIndex = new Map<Attribution, number>()
  const addAttr = (a: Attribution, url: string): number => {
    const known = attrIndex.get(a)
    if (known != null) return known
    outAttr.push({
      slug: a.slug,
      kind: a.kind,
      source: a.source,
      source_url: a.source_url,
      creator: a.creator,
      license: a.license,
      license_url: a.license_url ?? null,
      title: a.title,
      retrieved: a.retrieved,
      modified: a.modified ?? null,
      url,
    })
    attrIndex.set(a, outAttr.length - 1)
    return outAttr.length - 1
  }

  const mediaManifest: { url: string; bytes: number }[] = []

  const photosDir = join(parkDir, 'media', 'photos')
  const buildPhoto = (slug: string, g: AppSpecies | undefined): PhotoRef | null => {
    const file = g?.photo?.file ?? `media/photos/${slug}.webp`
    const abs = join(parkDir, file)
    if (!existsSync(abs)) return null
    const attr = g?.photo
      ? resolveAttr(g.photo, slug, 'photo')
      : rawAttr.find((a) => a.slug === slug && a.kind === 'photo') ?? null
    if (!attr) {
      warnings.push(`${slug}: foto zonder attributie weggelaten`)
      return null
    }
    const url = `park/media/photos/${basename(file)}`
    addFile(abs, url)
    mediaManifest.push({ url, bytes: fileSize(abs) })
    const thumbName = basename(file).replace(/\.webp$/, '-thumb.webp')
    const thumbAbs = join(photosDir, thumbName)
    let thumb_url = url
    if (existsSync(thumbAbs)) {
      thumb_url = `park/media/photos/${thumbName}`
      addFile(thumbAbs, thumb_url)
    }
    return { url, thumb_url, attribution: addAttr(attr, url) }
  }

  const findAudio = (file: string): string | null => {
    if (file.startsWith('build-cache/')) {
      const rel = file.slice('build-cache/'.length)
      for (const dir of cacheDirs) {
        const p = join(dir, rel)
        if (existsSync(p)) return p
      }
      return null
    }
    const p = join(parkDir, file)
    return existsSync(p) ? p : null
  }

  const buildAudio = (slug: string, g: AppSpecies | undefined): AudioRef | null => {
    for (const ref of g?.audio ?? []) {
      const abs = findAudio(ref.file)
      if (!abs) continue
      const attr = resolveAttr(ref, slug, 'audio')
      if (!attr) {
        warnings.push(`${slug}: geluid zonder attributie weggelaten`)
        continue
      }
      const out: AudioRef = { opus_url: null, m4a_url: null, attribution: -1 }
      const ext = extname(abs)
      const stem = abs.slice(0, abs.length - ext.length)
      let primaryUrl: string | null = null
      for (const [e, key] of [['.opus', 'opus_url'], ['.m4a', 'm4a_url']] as const) {
        const p = ext === e ? abs : existsSync(stem + e) ? stem + e : null
        if (!p) continue
        const url = `park/media/audio/${basename(p)}`
        out[key] = url
        primaryUrl ??= url
        addFile(p, url)
        mediaManifest.push({ url, bytes: fileSize(p) })
      }
      if (!primaryUrl) continue // onbekende extensie
      out.attribution = addAttr(attr, primaryUrl)
      return out
    }
    return null
  }

  const species: BundleSpecies[] = []
  for (const row of rows as unknown as (SpeciesRow & Record<string, string>)[]) {
    const status = (row.status || 'draft') as BundleSpecies['status']
    if (status === 'absent') continue
    const slug = row.slug
    const g = goldBySlug.get(slug)
    const facts = parseFacts(join(parkDir, 'facts', `${slug}.yaml`), slug)
    species.push({
      slug,
      scientific_name: row.scientific_name,
      name: nullIfEmpty(g?.name) ?? nullIfEmpty(row.name_nl) ?? row.scientific_name,
      name_alt: g?.name_alt ?? null,
      order: g?.order ?? null,
      family: g?.family ?? null,
      iucn: g?.iucn ?? null,
      wikidata: {
        wingspan_cm: g?.wingspan_cm ?? null,
        mass_g: g?.mass_g ?? null,
        lifespan_y: g?.lifespan_y ?? null,
      },
      zone_id: nullIfEmpty(row.zone_id) ?? g?.zone_id ?? null,
      place_id: nullIfEmpty(row.place_id) ?? g?.place_id ?? null,
      last_seen: nullIfEmpty(row.last_seen) ?? g?.last_seen ?? null,
      status,
      photo: buildPhoto(slug, g),
      audio: buildAudio(slug, g),
      links: {
        wikipedia: g?.links.wikipedia ?? null,
        xeno_canto: g?.links.xeno_canto ?? null,
        wikidata: g?.links.wikidata ?? null,
        park: nullIfEmpty(row.park_url),
      },
      facts,
      size_class: sizeClassFor(facts),
      text: parseText(parkDir, lang, slug),
    })
  }
  species.sort((a, b) => a.name.localeCompare(b.name, lang))

  // Kaart
  let map: ParkBundle['map'] = null
  const georefRel = park.map_georef ?? 'map/georef.json'
  const georefPath = join(parkDir, georefRel)
  if (existsSync(georefPath)) {
    const g = readJson<Georef>(georefPath)
    const svgAbs = join(parkDir, georefRel, '..', g.svg.file)
    if (existsSync(svgAbs)) {
      const url = `park/map/${basename(g.svg.file)}`
      addFile(svgAbs, url)
      map = { url, georef: { svg: g.svg, affine: g.affine } }
    } else {
      warnings.push(`kaart-svg ontbreekt: ${svgAbs}`)
    }
  }

  const bundle: ParkBundle = {
    lang,
    generated: opts.now ?? new Date().toISOString(),
    park,
    species,
    places: readJson<PlacesCollection>(join(parkDir, 'places.geojson')),
    programme: readJson<Programme>(join(parkDir, 'programme.json')),
    attributions: outAttr,
    map,
    media_manifest: mediaManifest,
  }
  return { bundle, files: [...files.values()], warnings }
}
