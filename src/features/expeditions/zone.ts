// Zonecheck voor expedities (docs/FASE-2.md §6.1). Puur: geen state, geen opslag van posities.
import type { PlaceFeature, Season } from '../../park/types'

export interface ZoneFix {
  lat: number
  lon: number
  accuracy: number
}

/** Maximale marge (m) rond de rand waarmee een nauwkeurige fix nog als "in de zone" telt. */
export const EDGE_MARGIN_M = 25

type Ring = number[][]
type XY = [number, number]

const R = 6371008.8

/** Polygonen (elk: buitenring + gaten) van een zone; lege lijst voor andere geometrieën. */
function polygons(zone: PlaceFeature): Ring[][] {
  const g = zone.geometry
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  return []
}

/** Lokale equirectangulaire projectie rond (lat0, lon0): meters oost/noord. */
function project(lat0: number, lon0: number) {
  const k = Math.cos((lat0 * Math.PI) / 180)
  return (c: number[]): XY => [((c[0] - lon0) * Math.PI * R * k) / 180, ((c[1] - lat0) * Math.PI * R) / 180]
}

function inRing(p: XY, ring: XY[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function segDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Ligt het punt binnen de zone (Polygon/MultiPolygon, lon/lat; gaten tellen als buiten)? */
export function pointInZone(lat: number, lon: number, zone: PlaceFeature): boolean {
  const proj = project(lat, lon)
  return polygons(zone).some((poly) => {
    const rings = poly.map((r) => r.map(proj))
    return rings.length > 0 && inRing([0, 0], rings[0]) && !rings.slice(1).some((h) => inRing([0, 0], h))
  })
}

/** Afstand in meters van het punt tot de rand van de zone (Infinity zonder polygoon). */
export function distanceToEdgeM(lat: number, lon: number, zone: PlaceFeature): number {
  const proj = project(lat, lon)
  let best = Infinity
  for (const poly of polygons(zone)) {
    for (const ring of poly) {
      const pts = ring.map(proj)
      for (let i = 0; i < pts.length; i++) {
        best = Math.min(best, segDist([0, 0], pts[i], pts[(i + 1) % pts.length]))
      }
    }
  }
  return best
}

/** In de zone, of binnen min(accuracy, 25) m van de rand. */
export function inZone(fix: ZoneFix, zone: PlaceFeature): boolean {
  if (pointInZone(fix.lat, fix.lon, zone)) return true
  const margin = Math.min(Number.isFinite(fix.accuracy) ? Math.max(fix.accuracy, 0) : 0, EDGE_MARGIN_M)
  return distanceToEdgeM(fix.lat, fix.lon, zone) <= margin
}

/** Seizoen (MM-DD t/m MM-DD, mag over de jaargrens); geen seizoen = altijd actief. Lokale datum. */
export function seasonActive(season: Season | null | undefined, date: Date = new Date()): boolean {
  if (!season) return true
  const p = (n: number) => String(n).padStart(2, '0')
  const md = `${p(date.getMonth() + 1)}-${p(date.getDate())}`
  return season.from <= season.to ? md >= season.from && md <= season.to : md >= season.from || md <= season.to
}
