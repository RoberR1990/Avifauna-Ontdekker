// Afstand en projectie voor het herkomstkaartje (puur, getest in geo.test.ts).
export interface LatLon {
  lat: number
  lon: number
}

const R_KM = 6371.0088

/** Grootcirkelafstand in km (haversine). */
export function haversineKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Afronden voor weergave: tot 1000 km op 100 km (minimaal 100), daarboven op 500 km. */
export function roundDistanceKm(km: number): number {
  if (km <= 1000) return Math.max(100, Math.round(km / 100) * 100)
  return Math.round(km / 500) * 500
}

/** "11.000" (nl) of "11,000" (en); handmatig, om niet van ICU-data af te hangen. */
export function formatKm(km: number, lang: 'nl' | 'en'): string {
  return String(km).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'nl' ? '.' : ',')
}

/** Equirectangulair, viewBox 0 0 360 180. */
export function project(p: LatLon): [number, number] {
  return [p.lon + 180, 90 - p.lat]
}

/** Gebogen pad (kwadratisch) tussen twee punten, boog omhoog (noordwaarts). */
export function arcPath(a: [number, number], b: [number, number]): string {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const cy = my - Math.min(40, len * 0.3)
  const r = (n: number) => Math.round(n * 10) / 10
  return `M${r(a[0])} ${r(a[1])}Q${r(mx)} ${r(cy)} ${r(b[0])} ${r(b[1])}`
}
