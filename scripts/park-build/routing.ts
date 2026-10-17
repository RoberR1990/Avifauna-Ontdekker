// Padengraaf en kortste-pad (Dijkstra) uit map/osm-extract.json. Zie docs/FASE-2.md §3.3.
// Puur en zonder bestandstoegang. Knooppunten zijn unieke OSM-coördinaten (de extract bevat
// per way alleen geometrie, geen node-id's; gedeelde nodes hebben identieke coördinaten).
import type { Georef } from '../../src/data/types.ts'
import type { RouteProfile } from '../../src/park/types.ts'

type Affine = Georef['affine']

/** Kopie van gpsToSvg uit src/lib/geo.ts (de buildplugin laadt geen app-code): x = a*lon + c*lat + e ; y = b*lon + d*lat + f. */
function gpsToSvg(affine: Affine, lat: number, lon: number): { x: number; y: number } {
  return {
    x: affine.a * lon + affine.c * lat + affine.e,
    y: affine.b * lon + affine.d * lat + affine.f,
  }
}

/** Zelfde sets als pipeline/osm/classify.py (PATH_HIGHWAYS, ROAD_HIGHWAYS): wat in de extract als pad telt. */
export const PATH_HIGHWAYS = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track', 'bridleway', 'corridor'])
export const ROAD_HIGHWAYS = new Set([
  'service', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'living_street', 'road', 'tertiary_link',
])
const ROUGH_SURFACES = new Set(['sand', 'gravel', 'dirt', 'grass'])
const ROUGH_FACTOR = 5
/** Maximale afstand (m) van waypoint naar het dichtstbijzijnde knooppunt. */
export const MAX_SNAP_M = 60

export interface OsmElement {
  type: string
  id?: number
  geometry?: { lat: number; lon: number }[]
  tags?: Record<string, string>
}

interface Edge {
  to: number
  m: number
  steps: boolean
  rough: boolean
}

export interface PathGraph {
  nodes: { lat: number; lon: number }[]
  adj: Edge[][]
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function isWalkable(tags: Record<string, string>): boolean {
  const hw = tags.highway
  if (!hw || !(PATH_HIGHWAYS.has(hw) || ROAD_HIGHWAYS.has(hw))) return false
  if (tags.foot === 'no') return false
  if ((tags.access === 'private' || tags.access === 'no') && tags.foot !== 'yes' && tags.foot !== 'designated') return false
  return true
}

export function buildPathGraph(elements: OsmElement[]): PathGraph {
  const nodes: PathGraph['nodes'] = []
  const adj: Edge[][] = []
  const index = new Map<string, number>()
  const nodeFor = (lat: number, lon: number): number => {
    const key = `${lat.toFixed(7)},${lon.toFixed(7)}`
    let i = index.get(key)
    if (i === undefined) {
      i = nodes.length
      index.set(key, i)
      nodes.push({ lat, lon })
      adj.push([])
    }
    return i
  }
  for (const el of elements) {
    if (el.type !== 'way' || !el.tags || !el.geometry || el.geometry.length < 2 || !isWalkable(el.tags)) continue
    const steps = el.tags.highway === 'steps'
    const rough = !!el.tags.surface && ROUGH_SURFACES.has(el.tags.surface)
    for (let i = 0; i < el.geometry.length - 1; i++) {
      const a = el.geometry[i]
      const b = el.geometry[i + 1]
      const u = nodeFor(a.lat, a.lon)
      const v = nodeFor(b.lat, b.lon)
      if (u === v) continue
      const m = haversineM(a.lat, a.lon, b.lat, b.lon)
      adj[u].push({ to: v, m, steps, rough })
      adj[v].push({ to: u, m, steps, rough })
    }
  }
  return { nodes, adj }
}

export function nearestNode(g: PathGraph, lat: number, lon: number): { index: number; dist: number } | null {
  let best: { index: number; dist: number } | null = null
  for (let i = 0; i < g.nodes.length; i++) {
    const d = haversineM(lat, lon, g.nodes[i].lat, g.nodes[i].lon)
    if (!best || d < best.dist) best = { index: i, dist: d }
  }
  return best
}

/** Gewicht van een stuk pad voor het profiel; null = niet begaanbaar. */
function edgeWeight(e: Edge, profile: RouteProfile): number | null {
  if (profile === 'stroller') {
    if (e.steps) return null
    return e.rough ? e.m * ROUGH_FACTOR : e.m
  }
  return e.m
}

type HeapItem = [number, number]

function heapPush(heap: HeapItem[], item: HeapItem): void {
  heap.push(item)
  let i = heap.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (heap[p][0] <= heap[i][0]) break
    ;[heap[p], heap[i]] = [heap[i], heap[p]]
    i = p
  }
}

function heapPop(heap: HeapItem[]): HeapItem {
  const top = heap[0]
  const last = heap.pop()!
  if (heap.length > 0) {
    heap[0] = last
    let i = 0
    for (;;) {
      const l = 2 * i + 1
      const r = l + 1
      let s = i
      if (l < heap.length && heap[l][0] < heap[s][0]) s = l
      if (r < heap.length && heap[r][0] < heap[s][0]) s = r
      if (s === i) break
      ;[heap[s], heap[i]] = [heap[i], heap[s]]
      i = s
    }
  }
  return top
}

/** Dijkstra tussen twee knooppunten; geeft de knooppunt-indexen (incl. begin en eind) of null. */
export function shortestPath(g: PathGraph, from: number, to: number, profile: RouteProfile): number[] | null {
  if (from === to) return [from]
  const dist = new Float64Array(g.nodes.length).fill(Infinity)
  const prev = new Int32Array(g.nodes.length).fill(-1)
  const done = new Uint8Array(g.nodes.length)
  const heap: HeapItem[] = [[0, from]]
  dist[from] = 0
  while (heap.length > 0) {
    const [d, u] = heapPop(heap)
    if (done[u]) continue
    done[u] = 1
    if (u === to) break
    for (const e of g.adj[u]) {
      const w = edgeWeight(e, profile)
      if (w === null || done[e.to]) continue
      const nd = d + w
      if (nd < dist[e.to]) {
        dist[e.to] = nd
        prev[e.to] = u
        heapPush(heap, [nd, e.to])
      }
    }
  }
  if (!Number.isFinite(dist[to])) return null
  const path: number[] = []
  for (let n = to; n !== -1; n = prev[n]) path.push(n)
  return path.reverse()
}

export interface Waypoint {
  id: string
  lat: number
  lon: number
}

export interface RouteLine {
  /** "x,y x,y ..." in kaartcoördinaten, 1 decimaal, zonder dubbele opeenvolgende punten. */
  svg_points: string
  length_m: number
}

/** Loopsnelheid (m/u): 3 km/u, korte routes 2,5 km/u. */
export function speedMetersPerHour(profile: RouteProfile): number {
  return profile === 'short' ? 2500 : 3000
}

/** Looptijd in minuten: afstand / snelheid + 2 min per stop. */
export function routeMinutes(lengthM: number, profile: RouteProfile, stops: number): number {
  return Math.round((lengthM / speedMetersPerHour(profile)) * 60) + 2 * stops
}

/**
 * Berekent de lijn langs de waypoints. Waypoints worden aan het dichtstbijzijnde knooppunt
 * gekoppeld (max `MAX_SNAP_M`); lukt dat of het pad niet, dan een rechte lijn plus waarschuwing.
 */
export function computeRouteLine(
  g: PathGraph | null,
  waypoints: Waypoint[],
  profile: RouteProfile,
  affine: Affine,
  warn: (msg: string) => void,
  label = 'route',
): RouteLine {
  const snaps = waypoints.map((w) => {
    const n = g ? nearestNode(g, w.lat, w.lon) : null
    if (!n || n.dist > MAX_SNAP_M) {
      warn(`${label}: waypoint ${w.id} ligt ${n ? Math.round(n.dist) + ' m' : 'te ver'} van het padennetwerk (max ${MAX_SNAP_M} m); rechte lijn`)
      return null
    }
    return n.index
  })
  const coords: { lat: number; lon: number }[] = []
  if (waypoints.length > 0) coords.push(waypoints[0])
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    const sa = snaps[i]
    const sb = snaps[i + 1]
    if (g && sa !== null && sb !== null) {
      const p = shortestPath(g, sa, sb, profile)
      if (p) coords.push(...p.map((n) => g.nodes[n]))
      else warn(`${label}: geen pad tussen ${a.id} en ${b.id} voor profiel ${profile}; rechte lijn`)
    }
    coords.push(b)
  }
  let length = 0
  for (let i = 0; i < coords.length - 1; i++) length += haversineM(coords[i].lat, coords[i].lon, coords[i + 1].lat, coords[i + 1].lon)
  const pts: string[] = []
  for (const c of coords) {
    const { x, y } = gpsToSvg(affine, c.lat, c.lon)
    const s = `${x.toFixed(1)},${y.toFixed(1)}`
    if (pts[pts.length - 1] !== s) pts.push(s)
  }
  return { svg_points: pts.join(' '), length_m: Math.round(length) }
}
