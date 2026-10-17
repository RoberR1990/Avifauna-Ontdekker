import type { Georef } from '../data/types'

export type Affine = Georef['affine']

/** GPS naar SVG-coördinaten: x = a*lon + c*lat + e ; y = b*lon + d*lat + f (zie georef.json van het park). */
export function gpsToSvg(affine: Affine, lat: number, lon: number): { x: number; y: number } {
  return {
    x: affine.a * lon + affine.c * lat + affine.e,
    y: affine.b * lon + affine.d * lat + affine.f,
  }
}

/** Omgekeerd: SVG naar GPS. */
export function svgToGps(affine: Affine, x: number, y: number): { lat: number; lon: number } {
  const { a, b, c, d, e, f } = affine
  const det = a * d - b * c
  return {
    lon: (d * (x - e) - c * (y - f)) / det,
    lat: (-b * (x - e) + a * (y - f)) / det,
  }
}

const EARTH_RADIUS_KM = 6371.0088

/** Afstand over de grote cirkel in kilometers. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}
