// Zone-afleiding (docs/FASE-2.md §3.5): plekken zonder zone_id krijgen een zone via
// punt-in-polygoon van hun centroid. Puur en zonder bestandstoegang, zodat het testbaar is.
import type { PlaceFeature, PlacesCollection, Position } from '../../src/park/types.ts'

export interface LonLat {
  lon: number
  lat: number
}

/** Maximale afstand (m) tot een zone-rand voor een plek net buiten de polygoon. */
export const ZONE_SNAP_M = 30

const R = 6371008.8

type Ring = Position[]

function polygonsOf(f: PlaceFeature): Ring[][] {
  const g = f.geometry
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  return []
}

/** Oppervlakte (vlakke benadering, graden²) van een ring: alleen voor onderlinge vergelijking. */
function ringArea(ring: Ring): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return a / 2
}

/** Centroid van een plek: punt zelf, anders oppervlaktegewogen centroid van de grootste buitenring. */
export function centroidOf(f: PlaceFeature): LonLat | null {
  const g = f.geometry
  if (g.type === 'Point') return { lon: g.coordinates[0], lat: g.coordinates[1] }
  const polys = polygonsOf(f)
  if (polys.length === 0) return null
  const outer = polys.map((p) => p[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0]
  if (!outer || outer.length === 0) return null
  const A = ringArea(outer)
  if (Math.abs(A) < 1e-18) {
    const n = outer.length
    return { lon: outer.reduce((s, p) => s + p[0], 0) / n, lat: outer.reduce((s, p) => s + p[1], 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < outer.length - 1; i++) {
    const [x0, y0] = outer[i]
    const [x1, y1] = outer[i + 1]
    const cr = x0 * y1 - x1 * y0
    cx += (x0 + x1) * cr
    cy += (y0 + y1) * cr
  }
  return { lon: cx / (6 * A), lat: cy / (6 * A) }
}

function inRing(pt: LonLat, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > pt.lat !== yj > pt.lat && pt.lon < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Punt in polygoon (buitenring minus gaten). */
export function pointInPolygon(pt: LonLat, polygon: Ring[]): boolean {
  if (polygon.length === 0 || !inRing(pt, polygon[0])) return false
  for (let h = 1; h < polygon.length; h++) if (inRing(pt, polygon[h])) return false
  return true
}

/** Afstand (m) van een punt tot de rand van een polygoon (lokale equirectangulaire benadering). */
export function distanceToPolygonM(pt: LonLat, polygon: Ring[]): number {
  const kx = (Math.PI / 180) * R * Math.cos((pt.lat * Math.PI) / 180)
  const ky = (Math.PI / 180) * R
  let best = Infinity
  for (const ring of polygon) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i][0] - pt.lon) * kx
      const ay = (ring[i][1] - pt.lat) * ky
      const bx = (ring[i + 1][0] - pt.lon) * kx
      const by = (ring[i + 1][1] - pt.lat) * ky
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return best
}

/**
 * Zone-id voor een punt: de kleinste zone die het punt bevat; anders de dichtstbijzijnde
 * zone binnen `snapM` meter; anders null.
 */
export function zoneForPoint(pt: LonLat, zones: PlaceFeature[], snapM = ZONE_SNAP_M): string | null {
  let hit: { id: string; area: number } | null = null
  for (const z of zones) {
    for (const poly of polygonsOf(z)) {
      if (!pointInPolygon(pt, poly)) continue
      const area = Math.abs(ringArea(poly[0]))
      if (!hit || area < hit.area) hit = { id: z.properties.id, area }
    }
  }
  if (hit) return hit.id
  let near: { id: string; d: number } | null = null
  for (const z of zones) {
    for (const poly of polygonsOf(z)) {
      const d = distanceToPolygonM(pt, poly)
      if (d <= snapM && (!near || d < near.d)) near = { id: z.properties.id, d }
    }
  }
  return near?.id ?? null
}

/** Geeft een kopie van de plekken waarin elke niet-zone zonder zone_id een afgeleide zone_id krijgt (indien gevonden). */
export function deriveZones(places: PlacesCollection): PlacesCollection {
  const zones = places.features.filter((f) => f.properties.kind === 'zone')
  return {
    ...places,
    features: places.features.map((f) => {
      if (f.properties.kind === 'zone' || f.properties.zone_id) return f
      const c = centroidOf(f)
      const zone = c ? zoneForPoint(c, zones) : null
      return zone ? { ...f, properties: { ...f.properties, zone_id: zone } } : f
    }),
  }
}
