// Album (stickers, badges, expedities, bingo), alleen op het toestel: IndexedDB via idb-keyval.
// Geen server, geen locatie. Zie docs/FASE-2.md §5.
import { createStore, get, set as idbSet, type UseStore } from 'idb-keyval'
import { useSyncExternalStore } from 'react'

export interface StickerEntry {
  /** ISO-datum (YYYY-MM-DD) van de eerste keer. */
  first: string
  last: string
  /** Aantal dagen waarop hij gezien is. */
  count: number
}

export interface BingoCard {
  day: string
  size: 9 | 16
  seed: number
  /** Per vakje: "s:<slug>" (soort) of "b:<behaviour-id>" (gedrag). */
  cells: string[]
  marked: number[]
  /** Aantal gevierde lijnen (zodat een lijn maar één keer gevierd wordt). */
  lines: number
}

export interface ExpeditionProgress {
  started: string
  /** stop-id -> ISO-datum */
  done: Record<string, string>
  completed?: string
}

export interface AlbumV1 {
  v: 1
  stickers: Record<string, StickerEntry>
  days: Record<string, { seen: string[]; favourite?: string }>
  badges: Record<string, { earned: string }>
  expeditions: Record<string, ExpeditionProgress>
  bingo: BingoCard | null
}

export interface BackupFile {
  app: 'avifauna-ontdekker-album'
  park: string
  exported: string
  album: AlbumV1
}

export type ImportResult = { ok: true; added: number } | { ok: false; reason: 'invalid' | 'other-park' }

const KEY = 'album'
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const emptyAlbum = (): AlbumV1 => ({ v: 1, stickers: {}, days: {}, badges: {}, expeditions: {}, bingo: null })

/** Lokale datum YYYY-MM-DD (tijdzone van het toestel). */
export function today(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

// ---------------------------------------------------------------- pure functies (getest)

export function withSticker(a: AlbumV1, slug: string, day: string): AlbumV1 {
  const prev = a.stickers[slug]
  const seenToday = a.days[day]?.seen ?? []
  if (prev && prev.last === day && seenToday.includes(slug)) return a
  const sticker: StickerEntry = prev
    ? { first: prev.first < day ? prev.first : day, last: prev.last > day ? prev.last : day, count: prev.last === day ? prev.count : prev.count + 1 }
    : { first: day, last: day, count: 1 }
  const seen = seenToday.includes(slug) ? seenToday : [...seenToday, slug]
  return { ...a, stickers: { ...a.stickers, [slug]: sticker }, days: { ...a.days, [day]: { ...a.days[day], seen } } }
}

export function withBadge(a: AlbumV1, id: string, day: string): AlbumV1 {
  if (a.badges[id]) return a
  return { ...a, badges: { ...a.badges, [id]: { earned: day } } }
}

export function withStop(a: AlbumV1, expId: string, stopId: string, day: string): AlbumV1 {
  const prev = a.expeditions[expId] ?? { started: day, done: {} }
  if (prev.done[stopId]) return a
  return { ...a, expeditions: { ...a.expeditions, [expId]: { ...prev, done: { ...prev.done, [stopId]: day } } } }
}

/** Valideert een (geïmporteerd) album; geeft null bij een ongeldige vorm. */
export function sanitizeAlbum(raw: unknown): AlbumV1 | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.v !== 1) return null
  const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null)
  const stickers = obj(r.stickers), days = obj(r.days), badges = obj(r.badges), exps = obj(r.expeditions)
  if (!stickers || !days || !badges || !exps) return null
  const out = emptyAlbum()
  for (const [slug, v] of Object.entries(stickers)) {
    const e = obj(v)
    if (!e || !DATE.test(String(e.first)) || !DATE.test(String(e.last)) || typeof e.count !== 'number' || e.count < 1) return null
    out.stickers[slug] = { first: String(e.first), last: String(e.last), count: Math.floor(e.count) }
  }
  for (const [day, v] of Object.entries(days)) {
    const e = obj(v)
    if (!DATE.test(day) || !e || !Array.isArray(e.seen) || !e.seen.every((s) => typeof s === 'string')) return null
    out.days[day] = { seen: [...(e.seen as string[])], ...(typeof e.favourite === 'string' ? { favourite: e.favourite } : {}) }
  }
  for (const [id, v] of Object.entries(badges)) {
    const e = obj(v)
    if (!e || !DATE.test(String(e.earned))) return null
    out.badges[id] = { earned: String(e.earned) }
  }
  for (const [id, v] of Object.entries(exps)) {
    const e = obj(v)
    const done = obj(e?.done)
    if (!e || !DATE.test(String(e.started)) || !done || !Object.values(done).every((d) => DATE.test(String(d)))) return null
    out.expeditions[id] = {
      started: String(e.started),
      done: Object.fromEntries(Object.entries(done).map(([k, d]) => [k, String(d)])),
      ...(DATE.test(String(e.completed)) ? { completed: String(e.completed) } : {}),
    }
  }
  const b = obj(r.bingo)
  if (b && DATE.test(String(b.day)) && (b.size === 9 || b.size === 16) && Array.isArray(b.cells) && b.cells.length === b.size && Array.isArray(b.marked)) {
    out.bingo = {
      day: String(b.day),
      size: b.size,
      seed: Number(b.seed) || 0,
      cells: b.cells.map(String),
      marked: (b.marked as unknown[]).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < (b.size as number)),
      lines: Number(b.lines) || 0,
    }
  }
  return out
}

const minD = (a: string, b: string) => (a < b ? a : b)
const maxD = (a: string, b: string) => (a > b ? a : b)

/** Unie van twee albums; nooit iets kwijtraken. Bingo: de nieuwste dag wint. */
export function mergeAlbums(a: AlbumV1, b: AlbumV1): AlbumV1 {
  const out: AlbumV1 = structuredClone(a)
  for (const [slug, s] of Object.entries(b.stickers)) {
    const p = out.stickers[slug]
    out.stickers[slug] = p ? { first: minD(p.first, s.first), last: maxD(p.last, s.last), count: Math.max(p.count, s.count) } : { ...s }
  }
  for (const [day, d] of Object.entries(b.days)) {
    const p = out.days[day]
    out.days[day] = p
      ? { seen: [...p.seen, ...d.seen.filter((s) => !p.seen.includes(s))], ...((p.favourite ?? d.favourite) ? { favourite: p.favourite ?? d.favourite } : {}) }
      : { seen: [...d.seen], ...(d.favourite ? { favourite: d.favourite } : {}) }
  }
  for (const [id, x] of Object.entries(b.badges)) {
    out.badges[id] = out.badges[id] ? { earned: minD(out.badges[id].earned, x.earned) } : { ...x }
  }
  for (const [id, e] of Object.entries(b.expeditions)) {
    const p = out.expeditions[id]
    if (!p) {
      out.expeditions[id] = structuredClone(e)
      continue
    }
    const done = { ...e.done }
    for (const [k, d] of Object.entries(p.done)) done[k] = done[k] ? minD(done[k], d) : d
    const completed = p.completed && e.completed ? minD(p.completed, e.completed) : (p.completed ?? e.completed)
    out.expeditions[id] = { started: minD(p.started, e.started), done, ...(completed ? { completed } : {}) }
  }
  if (b.bingo && (!out.bingo || b.bingo.day > out.bingo.day)) out.bingo = structuredClone(b.bingo)
  return out
}

// ---------------------------------------------------------------- opslag + React

let store: UseStore | null = null
let album: AlbumV1 = emptyAlbum()
let ready = false
/** false als IndexedDB niet werkt (privévenster): album alleen in het geheugen. */
let persistent = true
const listeners = new Set<() => void>()
let snapshot = { album, ready, persistent }

function emit() {
  snapshot = { album, ready, persistent }
  listeners.forEach((l) => l())
}

function db(): UseStore | null {
  if (store) return store
  try {
    if (typeof indexedDB === 'undefined') return null
    store = createStore('ao-album', 'kv')
    return store
  } catch {
    return null
  }
}

let loading: Promise<void> | null = null
function load(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    const s = db()
    if (!s) {
      persistent = false
    } else {
      try {
        const raw = await get(KEY, s)
        const loaded = raw ? sanitizeAlbum(raw) : null
        // Wat al in het geheugen is gezet (voor het laden klaar was) niet kwijtraken.
        album = loaded ? mergeAlbums(loaded, album) : album
      } catch {
        persistent = false
      }
    }
    ready = true
    emit()
  })()
  return loading
}

function commit(next: AlbumV1) {
  if (next === album) return
  album = next
  emit()
  const s = db()
  if (!s || !persistent) return
  idbSet(KEY, album, s).catch(() => {
    persistent = false
    emit()
  })
}

function subscribe(l: () => void) {
  listeners.add(l)
  void load()
  return () => listeners.delete(l)
}

const getSnapshot = () => snapshot

export const albumActions = {
  addSticker(slug: string, day = today()) {
    commit(withSticker(album, slug, day))
  },
  setFavourite(day: string, slug: string) {
    const d = album.days[day] ?? { seen: [] }
    commit({ ...album, days: { ...album.days, [day]: { ...d, favourite: slug } } })
  },
  earnBadge(id: string, day = today()) {
    commit(withBadge(album, id, day))
  },
  markStop(expId: string, stopId: string, day = today()) {
    commit(withStop(album, expId, stopId, day))
  },
  completeExpedition(expId: string, badgeId: string, day = today()) {
    const p = album.expeditions[expId] ?? { started: day, done: {} }
    if (p.completed) return
    commit(withBadge({ ...album, expeditions: { ...album.expeditions, [expId]: { ...p, completed: day } } }, badgeId, day))
  },
  resetExpedition(expId: string) {
    const rest = { ...album.expeditions }
    delete rest[expId]
    commit({ ...album, expeditions: rest })
  },
  setBingo(card: BingoCard | null) {
    commit({ ...album, bingo: card })
  },
  /** Maakt een back-upbestand (JSON) en biedt het als download aan. */
  exportFile(parkId: string, now: Date = new Date()): BackupFile {
    const file: BackupFile = { app: 'avifauna-ontdekker-album', park: parkId, exported: now.toISOString(), album }
    if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `album-${parkId}-${today(now)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return file
  },
  /** Leest een back-up en voegt hem samen met het huidige album (nooit overschrijven). */
  async importFile(file: Blob, parkId: string): Promise<ImportResult> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      return { ok: false, reason: 'invalid' }
    }
    const p = parsed as Partial<BackupFile> | null
    if (!p || p.app !== 'avifauna-ontdekker-album') return { ok: false, reason: 'invalid' }
    if (p.park !== parkId) return { ok: false, reason: 'other-park' }
    const incoming = sanitizeAlbum(p.album)
    if (!incoming) return { ok: false, reason: 'invalid' }
    await load()
    const before = Object.keys(album.stickers).length
    commit(mergeAlbums(album, incoming))
    return { ok: true, added: Object.keys(album.stickers).length - before }
  },
}

/** { album, ready, persistent } + acties. */
export function useAlbum() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { ...s, ...albumActions }
}

/** Huidig album buiten React. */
export function getAlbum(): AlbumV1 {
  return album
}

/** Alleen voor tests. */
export async function _resetAlbumForTest(next: AlbumV1 = emptyAlbum()) {
  album = next
  ready = false
  persistent = true
  loading = null
  store = null
  emit()
}
