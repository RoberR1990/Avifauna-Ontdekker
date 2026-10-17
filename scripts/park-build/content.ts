// Fase 2: expedities, bingo en routes uit het parkpakket naar de bundel (docs/FASE-2.md §3, §4).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type {
  BundleBingo,
  BundleExpedition,
  BundleRoute,
  BundleSpecies,
  BundleStop,
  Georef,
  Lang,
} from '../../src/data/types.ts'
import type {
  BingoFile,
  ExpeditionsFile,
  LocalizedNl,
  PlaceFeature,
  PlacesCollection,
  RoutesFile,
} from '../../src/park/types.ts'
import { buildPathGraph, computeRouteLine, routeMinutes } from './routing.ts'
import type { OsmElement, PathGraph, Waypoint } from './routing.ts'
import { centroidOf } from './zones.ts'

function readYamlIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null
  const data = parseYaml(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as T | null
  return data ?? null
}

/** Tekst in de bundeltaal; valt terug op nl. */
export function localize(l: LocalizedNl | undefined | null, lang: Lang): string {
  if (!l) return ''
  const v = (l as Record<string, string | undefined>)[lang]
  return v && v.trim() ? v : l.nl
}

function placeName(f: PlaceFeature | undefined, lang: Lang): string | null {
  if (!f) return null
  const p = f.properties as unknown as Record<string, string | undefined>
  return p[`name_${lang}`] || p.name_nl || null
}

interface Ctx {
  parkDir: string
  lang: Lang
  /** Plekken mét afgeleide zone_id. */
  places: PlacesCollection
  species: BundleSpecies[]
  warnings: string[]
}

export function buildExpeditions(ctx: Ctx): BundleExpedition[] {
  const file = readYamlIfExists<ExpeditionsFile>(join(ctx.parkDir, 'expeditions.yaml'))
  if (!file?.expeditions) return []
  const { lang, warnings } = ctx
  const byId = new Map(ctx.places.features.map((f) => [f.properties.id, f]))
  const confirmed = new Set(ctx.species.filter((s) => s.status === 'confirmed').map((s) => s.slug))
  const out: BundleExpedition[] = []
  for (const ex of file.expeditions) {
    const stops: BundleStop[] = []
    for (const st of ex.stops ?? []) {
      if (st.species && !confirmed.has(st.species)) {
        warnings.push(`expeditie ${ex.id}, stop ${st.id}: soort ${st.species} is niet confirmed; stop weggelaten`)
        continue
      }
      const zone = byId.get(st.zone_id)
      const t = st.task
      let answer: number | null = null
      if (t.type === 'choose' && typeof t.answer === 'number') answer = t.answer
      else if (t.type === 'count' && t.answer !== undefined && t.answer !== null && t.answer !== '') {
        const n = Number(t.answer)
        answer = Number.isFinite(n) ? n : null
      }
      // Keuzes vast door elkaar (per stop-id), zodat het goede antwoord niet altijd bovenaan staat.
      let options = t.options ? t.options.map((o) => localize(o, lang)) : null
      if (options && t.type === 'choose') {
        const order = shuffledOrder(options.length, st.id)
        options = order.map((i) => options![i])
        if (answer !== null) answer = order.indexOf(answer)
      }
      stops.push({
        id: st.id,
        title: st.title ? localize(st.title, lang) : (placeName(zone, lang) ?? st.zone_id),
        zone_id: st.zone_id,
        place_id: st.place_id ?? null,
        species: st.species ?? null,
        indoor: st.indoor === true || zone?.properties.indoor === true,
        task: {
          type: t.type,
          prompt: localize(t.prompt, lang),
          options,
          answer,
          hint: t.hint ? localize(t.hint, lang) : null,
        },
      })
    }
    if (stops.length === 0) {
      warnings.push(`expeditie ${ex.id}: geen geldige stops over; expeditie weggelaten`)
      continue
    }
    out.push({
      id: ex.id,
      title: localize(ex.title, lang),
      intro: localize(ex.intro, lang),
      age: ex.age ?? 'all',
      minutes: ex.minutes ?? null,
      season: ex.season ?? null,
      badge: { id: ex.badge.id, name: localize(ex.badge.name, lang), icon: ex.badge.icon },
      stops,
    })
  }
  return out
}

export function buildBingo(ctx: Ctx): BundleBingo | null {
  const file = readYamlIfExists<BingoFile>(join(ctx.parkDir, 'bingo.yaml'))
  if (!file) return null
  const exclude = new Set(file.exclude ?? [])
  return {
    sizes: file.sizes,
    species_share: file.species_share,
    behaviours: (file.behaviours ?? []).map((b) => ({
      id: b.id,
      icon: b.icon,
      label: localize(b.label, ctx.lang),
      indoor_ok: b.indoor_ok === true,
    })),
    species: ctx.species.filter((s) => s.status === 'confirmed' && s.photo !== null && !exclude.has(s.slug)).map((s) => s.slug),
  }
}

export function buildRoutes(ctx: Ctx, georef: Georef | null): BundleRoute[] {
  const file = readYamlIfExists<RoutesFile>(join(ctx.parkDir, 'routes.yaml'))
  if (!file?.routes || file.routes.length === 0) return []
  const { lang, warnings } = ctx
  if (!georef) {
    warnings.push('routes.yaml aanwezig maar het park heeft geen kaart (georef); routes weggelaten')
    return []
  }
  let graph: PathGraph | null = null
  const extractPath = join(ctx.parkDir, 'map', 'osm-extract.json')
  if (existsSync(extractPath)) {
    const extract = JSON.parse(readFileSync(extractPath, 'utf8').replace(/^\uFEFF/, '')) as { elements?: OsmElement[] }
    graph = buildPathGraph(extract.elements ?? [])
  } else {
    warnings.push('map/osm-extract.json ontbreekt; routes worden rechte lijnen')
  }
  const byId = new Map(ctx.places.features.map((f) => [f.properties.id, f]))
  const out: BundleRoute[] = []
  for (const r of file.routes) {
    const waypoints: Waypoint[] = []
    const stops: BundleRoute['stops'] = []
    for (const id of r.waypoints) {
      const f = byId.get(id)
      const c = f ? centroidOf(f) : null
      if (!f || !c) {
        warnings.push(`route ${r.id}: waypoint ${id} bestaat niet (of heeft geen geometrie); weggelaten`)
        continue
      }
      waypoints.push({ id, lat: c.lat, lon: c.lon })
      const zone = f.properties.zone_id ? byId.get(f.properties.zone_id) : undefined
      stops.push({
        place_id: id,
        name: placeName(f, lang) ?? id,
        indoor: f.properties.indoor === true || zone?.properties.indoor === true,
      })
    }
    if (waypoints.length < 2) {
      warnings.push(`route ${r.id}: minder dan 2 geldige waypoints; route weggelaten`)
      continue
    }
    const line = computeRouteLine(graph, waypoints, r.profile, georef.affine, (m) => warnings.push(m), `route ${r.id}`)
    out.push({
      id: r.id,
      profile: r.profile,
      title: localize(r.title, lang),
      intro: localize(r.intro, lang),
      note: r.note ? localize(r.note, lang) : null,
      stops,
      svg_points: line.svg_points,
      length_m: line.length_m,
      minutes: routeMinutes(line.length_m, r.profile, stops.length),
      concept: true,
    })
  }
  return out
}

export type { Ctx as ContentCtx }

/** Deterministische volgorde 0..n-1 uit een tekst (FNV-1a + mulberry32); gelijk voor alle talen. */
export function shuffledOrder(n: number, key: string): number[] {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  let a = h >>> 0
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}
