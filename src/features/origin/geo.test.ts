import { describe, expect, it } from 'vitest'
import { arcPath, formatKm, haversineKm, project, roundDistanceKm } from './geo'

const alphen = { lat: 52.13, lon: 4.66 }

describe('haversineKm', () => {
  it('nul voor hetzelfde punt', () => expect(haversineKm(alphen, alphen)).toBe(0))
  it('Alphen - Lima ongeveer 10.700 km', () => {
    const d = haversineKm(alphen, { lat: -12.05, lon: -77.04 })
    expect(d).toBeGreaterThan(10500)
    expect(d).toBeLessThan(10900)
  })
  it('Alphen - Amsterdam-Sydney sanity: 16.600 km', () => {
    const d = haversineKm(alphen, { lat: -33.87, lon: 151.21 })
    expect(d).toBeGreaterThan(16400)
    expect(d).toBeLessThan(16800)
  })
  it('symmetrisch', () => {
    const b = { lat: -20, lon: -72 }
    expect(haversineKm(alphen, b)).toBeCloseTo(haversineKm(b, alphen), 6)
  })
})

describe('roundDistanceKm', () => {
  it('tot 1000 km op 100', () => {
    expect(roundDistanceKm(12)).toBe(100)
    expect(roundDistanceKm(449)).toBe(400)
    expect(roundDistanceKm(451)).toBe(500)
    expect(roundDistanceKm(1000)).toBe(1000)
  })
  it('boven 1000 km op 500', () => {
    expect(roundDistanceKm(1240)).toBe(1000)
    expect(roundDistanceKm(1260)).toBe(1500)
    expect(roundDistanceKm(10987)).toBe(11000)
    expect(roundDistanceKm(11260)).toBe(11500)
  })
})

describe('formatKm / project / arcPath', () => {
  it('duizendtallen', () => {
    expect(formatKm(11000, 'nl')).toBe('11.000')
    expect(formatKm(11000, 'en')).toBe('11,000')
    expect(formatKm(900, 'nl')).toBe('900')
  })
  it('project: lon/lat naar viewBox 360x180', () => {
    expect(project({ lat: 0, lon: 0 })).toEqual([180, 90])
    expect(project({ lat: 90, lon: -180 })).toEqual([0, 0])
    expect(project({ lat: -90, lon: 180 })).toEqual([360, 180])
  })
  it('arcPath begint en eindigt op de punten', () => {
    expect(arcPath([10, 100], [200, 40])).toMatch(/^M10 100Q[\d. -]+ 200 40$/)
  })
})
