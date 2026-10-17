import { describe, expect, it } from 'vitest'
import { gpsToSvg, haversineKm, svgToGps } from './geo'

// affine uit parks/avifauna/map/georef.json (viewBox 0 0 1000 1234)
const affine = {
  a: 169176.4447856005,
  b: -4.219264301374064e-8,
  c: -3.7074532506374874e-12,
  d: -275646.54967445973,
  e: -786004.353901907,
  f: 14372636.580803812,
}

describe('gpsToSvg', () => {
  it('zet het kaartmidden (lat0/lon0) op origin_px', () => {
    const { x, y } = gpsToSvg(affine, 52.139305199999995, 4.649018099999999)
    expect(x).toBeCloseTo(500, 1)
    expect(y).toBeCloseTo(617, 1)
  })
  it('noord is omhoog (kleinere y), oost is naar rechts', () => {
    const mid = gpsToSvg(affine, 52.1393, 4.649)
    expect(gpsToSvg(affine, 52.1403, 4.649).y).toBeLessThan(mid.y)
    expect(gpsToSvg(affine, 52.1393, 4.65).x).toBeGreaterThan(mid.x)
  })
  it('svgToGps is het omgekeerde', () => {
    const { x, y } = gpsToSvg(affine, 52.14, 4.65)
    const g = svgToGps(affine, x, y)
    expect(g.lat).toBeCloseTo(52.14, 6)
    expect(g.lon).toBeCloseTo(4.65, 6)
  })
})

describe('haversineKm', () => {
  it('is 0 voor hetzelfde punt', () => {
    expect(haversineKm(52, 5, 52, 5)).toBe(0)
  })
  it('Amsterdam - Parijs is ongeveer 430 km', () => {
    const d = haversineKm(52.3676, 4.9041, 48.8566, 2.3522)
    expect(d).toBeGreaterThan(425)
    expect(d).toBeLessThan(435)
  })
  it('een graad breedte is ongeveer 111 km', () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1)
  })
})
