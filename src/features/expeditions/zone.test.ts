import { describe, expect, it } from 'vitest'
import type { PlaceFeature, Position } from '../../park/types'
import { distanceToEdgeM, inZone, pointInZone, seasonActive } from './zone'

const ring = (w: number, s: number, e: number, n: number): Position[] => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
]

function feat(geometry: PlaceFeature['geometry']): PlaceFeature {
  return { type: 'Feature', properties: { id: 'z', kind: 'zone', name_nl: 'Z', source: 'osm' } as PlaceFeature['properties'], geometry }
}

const square = feat({ type: 'Polygon', coordinates: [ring(4.0, 51.0, 4.002, 51.001)] })
// 1 m in lengtegraad op 51 graden noorderbreedte is ongeveer 1/69970 graad
const M_LON = 1 / 69970

describe('zone: punt in polygoon', () => {
  it('binnen en buiten', () => {
    expect(pointInZone(51.0005, 4.001, square)).toBe(true)
    expect(pointInZone(51.01, 4.001, square)).toBe(false)
    expect(inZone({ lat: 51.0005, lon: 4.001, accuracy: 5 }, square)).toBe(true)
    expect(inZone({ lat: 51.01, lon: 4.001, accuracy: 5 }, square)).toBe(false)
  })

  it('gaten tellen als buiten', () => {
    const holed = feat({ type: 'Polygon', coordinates: [ring(4.0, 51.0, 4.002, 51.001), ring(4.0008, 51.0004, 4.0012, 51.0006)] })
    expect(pointInZone(51.0005, 4.001, holed)).toBe(false)
    expect(pointInZone(51.0001, 4.0002, holed)).toBe(true)
  })

  it('MultiPolygon: elk deel telt', () => {
    const multi = feat({
      type: 'MultiPolygon',
      coordinates: [[ring(4.0, 51.0, 4.002, 51.001)], [ring(4.01, 51.01, 4.012, 51.011)]],
    })
    expect(pointInZone(51.0105, 4.011, multi)).toBe(true)
    expect(pointInZone(51.0005, 4.001, multi)).toBe(true)
    expect(pointInZone(51.005, 4.005, multi)).toBe(false)
  })
})

describe('zone: rand en accuracy', () => {
  it('afstand tot de rand klopt grofweg in meters', () => {
    expect(distanceToEdgeM(51.0005, 4.0 - 10 * M_LON, square)).toBeCloseTo(10, 0)
    expect(distanceToEdgeM(51.0005, 4.001, square)).toBeGreaterThan(30)
  })

  it('net buiten de rand telt mee als de accuracy groot genoeg is', () => {
    const lon = 4.0 - 10 * M_LON
    expect(inZone({ lat: 51.0005, lon, accuracy: 5 }, square)).toBe(false)
    expect(inZone({ lat: 51.0005, lon, accuracy: 15 }, square)).toBe(true)
  })

  it('de marge is hoogstens 25 m, ook bij een slechte accuracy', () => {
    expect(inZone({ lat: 51.0005, lon: 4.0 - 20 * M_LON, accuracy: 500 }, square)).toBe(true)
    expect(inZone({ lat: 51.0005, lon: 4.0 - 30 * M_LON, accuracy: 500 }, square)).toBe(false)
  })

  it('zone zonder polygoon (punt) is nooit "in zone"', () => {
    const pt = feat({ type: 'Point', coordinates: [4.001, 51.0005] })
    expect(inZone({ lat: 51.0005, lon: 4.001, accuracy: 10 }, pt)).toBe(false)
  })
})

describe('seasonActive', () => {
  const d = (m: number, day: number) => new Date(2026, m - 1, day, 12)
  it('zonder seizoen altijd actief', () => {
    expect(seasonActive(null, d(7, 1))).toBe(true)
    expect(seasonActive(undefined, d(7, 1))).toBe(true)
  })
  it('binnen één kalenderjaar', () => {
    const s = { from: '04-01', to: '09-30' }
    expect(seasonActive(s, d(4, 1))).toBe(true)
    expect(seasonActive(s, d(9, 30))).toBe(true)
    expect(seasonActive(s, d(10, 1))).toBe(false)
    expect(seasonActive(s, d(3, 31))).toBe(false)
  })
  it('over de jaargrens (11-15 t/m 02-15)', () => {
    const s = { from: '11-15', to: '02-15' }
    expect(seasonActive(s, d(11, 14))).toBe(false)
    expect(seasonActive(s, d(11, 15))).toBe(true)
    expect(seasonActive(s, d(12, 31))).toBe(true)
    expect(seasonActive(s, d(1, 1))).toBe(true)
    expect(seasonActive(s, d(2, 15))).toBe(true)
    expect(seasonActive(s, d(2, 16))).toBe(false)
    expect(seasonActive(s, d(7, 1))).toBe(false)
  })
})
