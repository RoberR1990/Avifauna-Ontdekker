import { gpsToSvg, haversineKm, type Affine } from '../../lib/geo'
import type { PlaceFeature } from '../../park/types'

export interface Pt {
  x: number
  y: number
}
/** Zichtvenster: middelpunt en breedte in SVG-eenheden; hoogte volgt uit de verhouding van de container. */
export interface View {
  cx: number
  cy: number
  w: number
}
export interface Size {
  w: number
  h: number
}

export const MAX_ZOOM = 8
/** Verder dan dit van het parkmidden telt als "niet in het park". */
export const PARK_RADIUS_M = 300

export function projectCoord(affine: Affine, c: number[]): Pt {
  return gpsToSvg(affine, c[1]!, c[0]!)
}

function rings(f: PlaceFeature): number[][][] {
  const g = f.geometry
  if (g.type === 'Polygon') return g.coordinates.map((r) => r as number[][])
  if (g.type === 'MultiPolygon') return g.coordinates.flatMap((p) => p.map((r) => r as number[][]))
  return []
}

/** SVG-pad (d) van een vlak; leeg voor punten. */
export function featurePath(f: PlaceFeature, affine: Affine): string {
  return rings(f)
    .map((ring) => {
      const pts = ring.map((c) => projectCoord(affine, c))
      return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z'
    })
    .join('')
}

export function featureBounds(f: PlaceFeature, affine: Affine): { minX: number; minY: number; maxX: number; maxY: number } {
  const g = f.geometry
  const pts =
    g.type === 'Point' ? [projectCoord(affine, g.coordinates)] : rings(f).flatMap((r) => r.map((c) => projectCoord(affine, c)))
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  }
}

/** Zwaartepunt in SVG-eenheden (oppervlakte-gewogen voor vlakken, buitenste ring). */
export function featureCentroid(f: PlaceFeature, affine: Affine): Pt {
  const g = f.geometry
  if (g.type === 'Point') return projectCoord(affine, g.coordinates)
  const outer = rings(f)[0]!.map((c) => projectCoord(affine, c))
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i]!
    const q = outer[(i + 1) % outer.length]!
    const cr = p.x * q.y - q.x * p.y
    a += cr
    cx += (p.x + q.x) * cr
    cy += (p.y + q.y) * cr
  }
  if (Math.abs(a) < 1e-9) {
    const b = featureBounds(f, affine)
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

/** Pixels per meter in de SVG (uit de affine afgeleid). */
export function pxPerMeter(affine: Affine): number {
  return Math.hypot(affine.b, affine.d) / 111_195
}

export function viewHeight(v: View, size: Size): number {
  return (v.w * size.h) / size.w
}

/** Breedte waarbij de hele kaart past. */
export function fitWidth(map: Size, size: Size): number {
  return Math.max(map.w, (map.h * size.w) / size.h)
}

/** Houdt zoom en midden binnen de kaart; past de kaart helemaal in beeld, dan blijft hij gecentreerd. */
export function clampView(v: View, map: Size, size: Size): View {
  const fit = fitWidth(map, size)
  const w = Math.min(fit, Math.max(fit / MAX_ZOOM, v.w))
  const h = viewHeight({ ...v, w }, size)
  const clampAxis = (c: number, span: number, total: number) =>
    span >= total ? total / 2 : Math.min(total - span / 2, Math.max(span / 2, c))
  return { w, cx: clampAxis(v.cx, w, map.w), cy: clampAxis(v.cy, h, map.h) }
}

export function fitView(map: Size, size: Size): View {
  return clampView({ cx: map.w / 2, cy: map.h / 2, w: fitWidth(map, size) }, map, size)
}

/** Zichtvenster dat een plek ruim omvat (punten: vaste zoom). */
export function viewForPlace(f: PlaceFeature, affine: Affine, map: Size, size: Size): View {
  const b = featureBounds(f, affine)
  const bw = b.maxX - b.minX
  const bh = b.maxY - b.minY
  const w = Math.max(map.w / 3, bw * 1.8, (bh * 1.8 * size.w) / size.h)
  return clampView({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w }, map, size)
}

/** Zichtvenster dat een reeks punten ruim omvat (route). */
export function viewForPoints(pts: Pt[], map: Size, size: Size): View {
  if (pts.length === 0) return fitView(map, size)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = Math.max(map.w / 4, (maxX - minX) * 1.3, ((maxY - minY) * 1.3 * size.w) / size.h)
  return clampView({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w }, map, size)
}

/** Zoom rond een punt in SVG-eenheden; het punt blijft op dezelfde schermplek. */
export function zoomAt(v: View, factor: number, at: Pt, map: Size, size: Size): View {
  const w = v.w / factor
  const k = w / v.w
  return clampView({ w, cx: at.x - (at.x - v.cx) * k, cy: at.y - (at.y - v.cy) * k }, map, size)
}

export type ParkFix = { inside: true; x: number; y: number; radius: number } | { inside: false }

/** Valt een GPS-fix binnen het kaartbereik én binnen 300 m van het parkmidden? */
export function locateInPark(
  affine: Affine,
  map: Size,
  center: { lat: number; lon: number } | null,
  fix: { lat: number; lon: number; accuracy?: number },
): ParkFix {
  const { x, y } = gpsToSvg(affine, fix.lat, fix.lon)
  if (x < 0 || y < 0 || x > map.w || y > map.h) return { inside: false }
  if (center && haversineKm(center.lat, center.lon, fix.lat, fix.lon) * 1000 > PARK_RADIUS_M) return { inside: false }
  const acc = fix.accuracy && Number.isFinite(fix.accuracy) ? fix.accuracy : 0
  return { inside: true, x, y, radius: acc * pxPerMeter(affine) }
}
