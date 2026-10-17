// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBundle, sizeClassFor } from './index'

const park = resolve(__dirname, 'fixtures/park')
const now = '2026-10-17T12:00:00Z'

function cacheWithAudio() {
  const dir = mkdtempSync(join(tmpdir(), 'ao-cache-'))
  mkdirSync(join(dir, 'audio'), { recursive: true })
  writeFileSync(join(dir, 'audio', 'spheniscus-humboldti.opus'), 'NC-AUDIO')
  return dir
}

describe('buildBundle (nl)', () => {
  const noCache = buildBundle(park, 'nl', { buildCacheDirs: [], now })
  const withCache = buildBundle(park, 'nl', { buildCacheDirs: [cacheWithAudio()], now })

  it('laat absent weg en sorteert op naam', () => {
    expect(noCache.bundle.species.map((s) => s.slug)).toEqual([
      'casuarius-casuarius', // naam valt terug op wetenschappelijke naam
      'spheniscus-humboldti',
      'struthio-camelus',
    ])
  })

  it('naam: goud, dan csv, dan wetenschappelijke naam; soorten zonder goud hebben null-velden', () => {
    const s = Object.fromEntries(noCache.bundle.species.map((x) => [x.slug, x]))
    expect(s['spheniscus-humboldti'].name).toBe('Humboldtpinguïn')
    expect(s['casuarius-casuarius'].name).toBe('Casuarius casuarius')
    expect(s['casuarius-casuarius'].order).toBeNull()
    expect(s['casuarius-casuarius'].photo).toBeNull()
    expect(s['casuarius-casuarius'].facts).toBeNull()
    expect(s['casuarius-casuarius'].text).toBeNull()
    expect(s['casuarius-casuarius'].size_class).toBeNull()
  })

  it('csv gaat voor op goud voor zone, plaats en parklink', () => {
    const p = noCache.bundle.species.find((x) => x.slug === 'spheniscus-humboldti')!
    expect(p.zone_id).toBe('zone-a')
    expect(p.place_id).toBe('verblijf-pinguins')
    expect(p.links.park).toBe('https://example.org/pinguin')
    expect(p.wikidata.mass_g).toBe(4500)
  })

  it('size_class uit height_cm, anders length_cm', () => {
    const s = Object.fromEntries(noCache.bundle.species.map((x) => [x.slug, x]))
    expect(s['struthio-camelus'].size_class).toBe('giant') // height 210-275
    expect(s['spheniscus-humboldti'].size_class).toBe('large') // length 56-70 -> 63
    expect(sizeClassFor(null)).toBeNull()
    expect(sizeClassFor({ height_cm: null, length_cm: [10, 20] } as never)).toBe('small')
    expect(sizeClassFor({ height_cm: null, length_cm: [30, 50] } as never)).toBe('medium')
  })

  it('audio alleen als het bestand bestaat; in-repo audio wel', () => {
    const s = Object.fromEntries(noCache.bundle.species.map((x) => [x.slug, x]))
    expect(s['spheniscus-humboldti'].audio).toBeNull()
    expect(s['struthio-camelus'].audio?.opus_url).toBe('park/media/audio/struthio-camelus.opus')
    const p = withCache.bundle.species.find((x) => x.slug === 'spheniscus-humboldti')!
    expect(p.audio?.opus_url).toBe('park/media/audio/spheniscus-humboldti.opus')
    expect(p.audio?.m4a_url).toBeNull()
  })

  it('foto met thumb; foto zonder bestand wordt null', () => {
    const s = Object.fromEntries(noCache.bundle.species.map((x) => [x.slug, x]))
    expect(s['spheniscus-humboldti'].photo).toMatchObject({
      url: 'park/media/photos/spheniscus-humboldti.webp',
      thumb_url: 'park/media/photos/spheniscus-humboldti-thumb.webp',
    })
    expect(s['struthio-camelus'].photo).toBeNull() // bestand ontbreekt in fixture
  })

  it('attributies worden gefilterd en opnieuw genummerd', () => {
    const { bundle } = noCache
    // alleen pinguïnfoto + struisvogelgeluid zijn gebruikt
    expect(bundle.attributions.map((a) => a.title)).toEqual(['Penguin', 'Boom'])
    const p = bundle.species.find((x) => x.slug === 'spheniscus-humboldti')!
    expect(bundle.attributions[p.photo!.attribution].creator).toBe('A. Maker')
    expect(bundle.attributions[0].url).toBe('park/media/photos/spheniscus-humboldti.webp')
    const o = bundle.species.find((x) => x.slug === 'struthio-camelus')!
    expect(bundle.attributions[o.audio!.attribution].license).toBe('CC0-1.0')
    // met cache erbij komt de NC-attributie mee, met modified
    const nc = withCache.bundle.attributions.find((a) => a.license === 'CC-BY-NC-SA-4.0')!
    expect(nc.modified).toBe('trimmed to 8 s')
  })

  it('facts en teksten', () => {
    const p = noCache.bundle.species.find((x) => x.slug === 'spheniscus-humboldti')!
    expect(p.facts?.length_cm).toEqual([56, 70])
    expect(p.facts?.reviewed).toBe(false)
    expect(p.text).toMatchObject({ lang: 'nl', kind: 'Kindtekst.', b1: 'B1-tekst.', kenner: null, reviewed: false })
  })

  it('kaart, plaatsen, programma en media_manifest', () => {
    const { bundle, files } = withCache
    expect(bundle.map?.url).toBe('park/map/map-base.svg')
    expect(bundle.map?.georef.affine.a).toBeCloseTo(169176.4)
    expect(bundle.places.features).toHaveLength(2)
    expect(bundle.programme.items).toEqual([])
    const urls = bundle.media_manifest.map((m) => m.url).sort()
    expect(urls).toEqual([
      'park/media/audio/spheniscus-humboldti.opus',
      'park/media/audio/struthio-camelus.opus',
      'park/media/photos/spheniscus-humboldti.webp',
    ])
    expect(bundle.media_manifest.find((m) => m.url.endsWith('struthio-camelus.opus'))!.bytes).toBe(13)
    expect(files.map((f) => f.to)).toContain('park/map/map-base.svg')
    expect(files.map((f) => f.to)).toContain('park/media/photos/spheniscus-humboldti-thumb.webp')
    expect(new Set(files.map((f) => f.to)).size).toBe(files.length)
  })
})

describe('buildBundle (en)', () => {
  const { bundle } = buildBundle(park, 'en', { buildCacheDirs: [], now })
  it('gebruikt engelse goudnaam en valt voor tekst terug op nl', () => {
    const p = bundle.species.find((x) => x.slug === 'spheniscus-humboldti')!
    expect(p.name).toBe('Humboldt penguin')
    expect(p.name_alt).toBe('Humboldtpinguïn')
    expect(p.text?.lang).toBe('nl') // geen texts/en voor de pinguïn
    const o = bundle.species.find((x) => x.slug === 'struthio-camelus')!
    expect(o.text).toMatchObject({ lang: 'en', b1: 'Ostrich b1.', kenner: null })
    expect(o.name).toBe('Struisvogel') // geen engelse goudrij: csv-naam
  })
})
