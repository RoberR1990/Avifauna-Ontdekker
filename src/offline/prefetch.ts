// Offline-pakket: grote foto's en audio (media_manifest) in cache "park-media" zetten. FASE-1 §2.
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { mediaUrl, useParkData } from '../data/ParkDataProvider'

export const MEDIA_CACHE = 'park-media'

export interface ManifestItem {
  url: string
  bytes: number
}

export type OfflinePhase = 'unsupported' | 'unknown' | 'partial' | 'downloading' | 'complete' | 'error'

export interface OfflineState {
  phase: OfflinePhase
  cached: number
  total: number
  bytesDone: number
  bytesTotal: number
}

export interface Progress {
  done: number
  total: number
  bytesDone: number
  bytesTotal: number
}

const initial: OfflineState = { phase: 'unknown', cached: 0, total: 0, bytesDone: 0, bytesTotal: 0 }
let state: OfflineState = initial
const listeners = new Set<() => void>()
let running: Promise<void> | null = null
let backgroundStarted = false

function setState(patch: Partial<OfflineState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function cachesSupported(): boolean {
  return typeof caches !== 'undefined'
}

/** Geen automatische download bij databesparing of een trage verbinding. */
export function shouldSkipBackground(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (!c) return false
  return c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g'
}

const abs = (url: string) => new URL(mediaUrl(url), location.href).href

/** Welke manifestitems zitten al in de cache? */
export async function cachedUrls(manifest: ManifestItem[]): Promise<Set<string>> {
  if (!cachesSupported()) return new Set()
  const cache = await caches.open(MEDIA_CACHE)
  const keys = new Set((await cache.keys()).map((r) => r.url))
  return new Set(manifest.filter((m) => keys.has(abs(m.url))).map((m) => m.url))
}

/** Werkt de status bij op basis van de cache. */
export async function refreshStatus(manifest: ManifestItem[]): Promise<void> {
  if (!cachesSupported()) return setState({ phase: 'unsupported' })
  if (state.phase === 'downloading') return
  const have = await cachedUrls(manifest)
  const total = manifest.length
  setState({
    phase: total > 0 && have.size === total ? 'complete' : total === 0 ? 'unknown' : 'partial',
    cached: have.size,
    total,
    bytesDone: manifest.filter((m) => have.has(m.url)).reduce((s, m) => s + m.bytes, 0),
    bytesTotal: manifest.reduce((s, m) => s + m.bytes, 0),
  })
}

/**
 * Haalt alle ontbrekende manifestbestanden op en zet ze in de cache.
 * Parallel (concurrency), hervat vanzelf: wat er al is wordt overgeslagen.
 */
export function downloadAll(
  manifest: ManifestItem[],
  onProgress?: (p: Progress) => void,
  opts: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<void> {
  if (running) return running
  if (!cachesSupported()) {
    setState({ phase: 'unsupported' })
    return Promise.resolve()
  }
  const concurrency = opts.concurrency ?? 4
  running = (async () => {
    const cache = await caches.open(MEDIA_CACHE)
    const have = await cachedUrls(manifest)
    const total = manifest.length
    const bytesTotal = manifest.reduce((s, m) => s + m.bytes, 0)
    let done = have.size
    let bytesDone = manifest.filter((m) => have.has(m.url)).reduce((s, m) => s + m.bytes, 0)
    const report = () => {
      setState({ phase: 'downloading', cached: done, total, bytesDone, bytesTotal })
      onProgress?.({ done, total, bytesDone, bytesTotal })
    }
    report()
    const queue = manifest.filter((m) => !have.has(m.url))
    let failed = false
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        if (opts.signal?.aborted) return
        try {
          const res = await fetch(abs(item.url), { signal: opts.signal })
          if (!res.ok) throw new Error(String(res.status))
          await cache.put(abs(item.url), res)
          done++
          bytesDone += item.bytes
          report()
        } catch {
          failed = true
          if (opts.signal?.aborted) return
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
    setState({ phase: failed ? 'error' : done === total ? 'complete' : 'partial', cached: done })
  })().finally(() => {
    running = null
  })
  return running
}

/**
 * Achtergronddownload: na serviceWorker.ready, in een rustig moment, tenzij saveData/2g.
 * Eén keer per sessie.
 */
export function startBackgroundPrefetch(manifest: ManifestItem[]): void {
  if (backgroundStarted || !cachesSupported() || manifest.length === 0) return
  if (shouldSkipBackground() || !('serviceWorker' in navigator)) {
    void refreshStatus(manifest)
    return
  }
  backgroundStarted = true
  void navigator.serviceWorker.ready.then(() => {
    const go = () => void refreshStatus(manifest).then(() => (state.phase === 'complete' ? undefined : downloadAll(manifest, undefined, { concurrency: 2 })))
    if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 10_000 })
    else setTimeout(go, 3000)
  })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const getSnapshot = () => state

/** Alleen voor tests. */
export function _resetOfflineForTest() {
  state = initial
  running = null
  backgroundStarted = false
}

/**
 * Status van het offline-pakket + knopfunctie. De eerste aanroep met een bundel start
 * (indien toegestaan) de achtergronddownload.
 */
export function useOfflineStatus(): OfflineState & { download: () => Promise<void> } {
  const { bundle } = useParkData()
  const manifest = bundle?.media_manifest
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (manifest) startBackgroundPrefetch(manifest)
    if (manifest) void refreshStatus(manifest)
  }, [manifest])

  const download = useCallback(() => (manifest ? downloadAll(manifest) : Promise.resolve()), [manifest])
  return { ...snap, download }
}
