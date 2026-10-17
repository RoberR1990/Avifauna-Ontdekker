import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetAlbumForTest,
  albumActions,
  emptyAlbum,
  getAlbum,
  mergeAlbums,
  sanitizeAlbum,
  today,
  withBadge,
  withSticker,
  type AlbumV1,
  type BackupFile,
} from './album'

const D1 = '2026-10-01'
const D2 = '2026-10-02'

describe('today', () => {
  it('geeft lokale YYYY-MM-DD', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('withSticker', () => {
  it('is idempotent per dag', () => {
    const a = withSticker(emptyAlbum(), 'x', D1)
    expect(a.stickers.x).toEqual({ first: D1, last: D1, count: 1 })
    expect(withSticker(a, 'x', D1)).toBe(a)
    expect(a.days[D1].seen).toEqual(['x'])
  })

  it('telt een nieuwe dag op en behoudt first', () => {
    const a = withSticker(withSticker(emptyAlbum(), 'x', D1), 'x', D2)
    expect(a.stickers.x).toEqual({ first: D1, last: D2, count: 2 })
    expect(a.days[D2].seen).toEqual(['x'])
  })

  it('bewaart de volgorde van soorten per dag', () => {
    const a = withSticker(withSticker(emptyAlbum(), 'a', D1), 'b', D1)
    expect(a.days[D1].seen).toEqual(['a', 'b'])
    expect(a.stickers.b.count).toBe(1)
  })
})

describe('withBadge', () => {
  it('kent een badge één keer toe', () => {
    const a = withBadge(emptyAlbum(), 'b', D1)
    expect(withBadge(a, 'b', D2)).toBe(a)
    expect(a.badges.b.earned).toBe(D1)
  })
})

describe('mergeAlbums', () => {
  it('neemt de unie, vroegste first, laatste last en maximale count', () => {
    let a = withSticker(withSticker(emptyAlbum(), 'x', D2), 'y', D2)
    let b = withSticker(withSticker(withSticker(emptyAlbum(), 'x', D1), 'x', '2026-10-03'), 'z', D1)
    b = withBadge(b, 'bd', D1)
    a = withBadge(a, 'bd', D2)
    const m = mergeAlbums(a, b)
    expect(Object.keys(m.stickers).sort()).toEqual(['x', 'y', 'z'])
    expect(m.stickers.x).toEqual({ first: D1, last: '2026-10-03', count: 2 })
    expect(m.badges.bd.earned).toBe(D1)
    expect(m.days[D2].seen).toEqual(['x', 'y'])
    expect(m.days[D1].seen).toEqual(['x', 'z'])
  })

  it('wijzigt de invoer niet en laat de nieuwste bingo winnen', () => {
    const card = (day: string) => ({ day, size: 9 as const, seed: 1, cells: Array(9).fill('s:a'), marked: [], lines: 0 })
    const a: AlbumV1 = { ...emptyAlbum(), bingo: card(D1) }
    const b: AlbumV1 = { ...emptyAlbum(), bingo: card(D2) }
    const before = JSON.stringify(a)
    expect(mergeAlbums(a, b).bingo?.day).toBe(D2)
    expect(mergeAlbums(b, a).bingo?.day).toBe(D2)
    expect(JSON.stringify(a)).toBe(before)
  })

  it('voegt expeditievoortgang samen', () => {
    const a: AlbumV1 = { ...emptyAlbum(), expeditions: { e: { started: D2, done: { s1: D2 } } } }
    const b: AlbumV1 = { ...emptyAlbum(), expeditions: { e: { started: D1, done: { s1: D1, s2: D2 }, completed: D2 } } }
    expect(mergeAlbums(a, b).expeditions.e).toEqual({ started: D1, done: { s1: D1, s2: D2 }, completed: D2 })
  })
})

describe('sanitizeAlbum', () => {
  const good = () => withBadge(withSticker(emptyAlbum(), 'x', D1), 'b', D1)

  it('accepteert een geldig album (ook na JSON-ronde)', () => {
    expect(sanitizeAlbum(JSON.parse(JSON.stringify(good())))).toEqual(good())
  })

  it.each([
    ['null', null],
    ['string', 'x'],
    ['verkeerde versie', { ...good(), v: 2 }],
    ['ontbrekende stickers', { ...good(), stickers: undefined }],
    ['stickers als array', { ...good(), stickers: [] }],
    ['ongeldige datum', { ...good(), stickers: { x: { first: 'gisteren', last: D1, count: 1 } } }],
    ['count 0', { ...good(), stickers: { x: { first: D1, last: D1, count: 0 } } }],
    ['count geen getal', { ...good(), stickers: { x: { first: D1, last: D1, count: '1' } } }],
    ['seen geen strings', { ...good(), days: { [D1]: { seen: [1] } } }],
    ['dag-sleutel ongeldig', { ...good(), days: { nu: { seen: [] } } }],
    ['badge zonder datum', { ...good(), badges: { b: {} } }],
    ['expeditie zonder done', { ...good(), expeditions: { e: { started: D1 } } }],
  ])('weigert: %s', (_n, raw) => {
    expect(sanitizeAlbum(raw)).toBeNull()
  })

  it('negeert een ongeldige bingo en filtert marked', () => {
    const base = good()
    expect(sanitizeAlbum({ ...base, bingo: { day: 'x' } })?.bingo).toBeNull()
    const ok = sanitizeAlbum({ ...base, bingo: { day: D1, size: 9, seed: 3, cells: Array(9).fill('s:a'), marked: [0, 99, -1, 2.5, 4], lines: 1 } })
    expect(ok?.bingo?.marked).toEqual([0, 4])
  })
})

const file = (obj: unknown) => new Blob([typeof obj === 'string' ? obj : JSON.stringify(obj)], { type: 'application/json' })
const backup = (album: AlbumV1, park = 'avifauna'): BackupFile => ({ app: 'avifauna-ontdekker-album', park, exported: '2026-10-17T10:00:00Z', album })

describe('importFile en exportFile', () => {
  beforeEach(async () => {
    await _resetAlbumForTest()
  })

  it('voegt samen met het huidige album', async () => {
    albumActions.addSticker('a', D1)
    const incoming = withSticker(withSticker(emptyAlbum(), 'a', D2), 'b', D2)
    const r = await albumActions.importFile(file(backup(incoming)), 'avifauna')
    expect(r).toEqual({ ok: true, added: 1 })
    expect(Object.keys(getAlbum().stickers).sort()).toEqual(['a', 'b'])
    expect(getAlbum().stickers.a.first).toBe(D1)
  })

  it('weigert een ander park zonder te wijzigen', async () => {
    albumActions.addSticker('a', D1)
    const before = getAlbum()
    const r = await albumActions.importFile(file(backup(withSticker(emptyAlbum(), 'b', D1), 'ander-park')), 'avifauna')
    expect(r).toEqual({ ok: false, reason: 'other-park' })
    expect(getAlbum()).toBe(before)
  })

  it.each([
    ['geen JSON', 'dit is geen json'],
    ['andere app', { app: 'iets-anders', park: 'avifauna', album: emptyAlbum() }],
    ['ongeldig album', { app: 'avifauna-ontdekker-album', park: 'avifauna', album: { v: 1 } }],
  ])('weigert ongeldig bestand: %s', async (_n, content) => {
    const before = getAlbum()
    const r = await albumActions.importFile(file(content), 'avifauna')
    expect(r).toEqual({ ok: false, reason: 'invalid' })
    expect(getAlbum()).toBe(before)
  })

  it('exportFile levert een back-up met app, park en album', () => {
    albumActions.addSticker('a', D1)
    const f = albumActions.exportFile('avifauna', new Date('2026-10-17T10:00:00Z'))
    expect(f.app).toBe('avifauna-ontdekker-album')
    expect(f.park).toBe('avifauna')
    expect(f.album.stickers.a).toBeDefined()
  })
})
