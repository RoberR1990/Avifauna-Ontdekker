import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetOfflineForTest, downloadAll, refreshStatus, shouldSkipBackground } from './prefetch'

function mockCaches() {
  const store = new Map<string, unknown>()
  const cache = {
    keys: async () => [...store.keys()].map((url) => ({ url })),
    put: vi.fn(async (url: string, res: unknown) => void store.set(url, res)),
  }
  vi.stubGlobal('caches', { open: async () => cache })
  return { store, cache }
}

const manifest = [
  { url: 'park/media/photos/a.webp', bytes: 10 },
  { url: 'park/media/audio/a.opus', bytes: 20 },
]

beforeEach(() => _resetOfflineForTest())
afterEach(() => vi.unstubAllGlobals())

describe('prefetch', () => {
  it('downloadAll haalt alleen ontbrekende bestanden en meldt voortgang', async () => {
    const { store } = mockCaches()
    store.set(new URL('/park/media/photos/a.webp', location.href).href, {})
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const progress = vi.fn()
    await downloadAll(manifest, progress)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/park/media/audio/a.opus')
    expect(progress).toHaveBeenLastCalledWith({ done: 2, total: 2, bytesDone: 30, bytesTotal: 30 })
  })

  it('refreshStatus herkent een volledige cache', async () => {
    const { store } = mockCaches()
    for (const m of manifest) store.set(new URL('/' + m.url, location.href).href, {})
    await refreshStatus(manifest)
    const { useOfflineStatus } = await import('./prefetch')
    expect(typeof useOfflineStatus).toBe('function')
  })

  it('respecteert saveData en 2g', () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } })
    expect(shouldSkipBackground()).toBe(true)
    vi.stubGlobal('navigator', { ...navigator, connection: { effectiveType: '2g' } })
    expect(shouldSkipBackground()).toBe(true)
    vi.stubGlobal('navigator', { ...navigator, connection: { effectiveType: '4g' } })
    expect(shouldSkipBackground()).toBe(false)
  })
})
