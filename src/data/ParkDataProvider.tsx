// Laadt de parkbundel (park/data.<lang>.json) en stelt hem beschikbaar via hooks.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { useT } from '../i18n'
import { useSettings } from '../state/settings'
import type { BundleSpecies, Lang, ParkBundle } from './types'
import type { PlaceFeature } from '../park/types'

export type ParkDataStatus = 'loading' | 'ready' | 'error'

interface ParkDataValue {
  /** Laatst geladen bundel; null zolang er nog geen is (of bij een fout zonder cache). */
  bundle: ParkBundle | null
  /** 'loading' ook bij een taalwissel (dan is bundle de vorige taal). */
  status: ParkDataStatus
  reload: () => void
}

const ParkDataContext = createContext<ParkDataValue | null>(null)

/** Pad onder base voor een relatieve url uit de bundel, bv. mediaUrl('park/media/photos/x.webp'). */
export function mediaUrl(rel: string): string {
  return `${import.meta.env.BASE_URL}${rel.replace(/^\/+/, '')}`
}

export function bundleUrl(lang: Lang): string {
  return mediaUrl(`park/data.${lang}.json`)
}

export function ParkDataProvider({ children }: { children: ReactNode }) {
  const { lang } = useSettings()
  const [bundle, setBundle] = useState<ParkBundle | null>(null)
  const [state, setState] = useState<{ lang: Lang | null; error: boolean }>({ lang: null, error: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(bundleUrl(lang), { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<ParkBundle>
      })
      .then((b) => {
        setBundle(b)
        setState({ lang, error: false })
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return
        setState({ lang, error: true })
      })
    return () => ctrl.abort()
  }, [lang, attempt])

  const reload = useCallback(() => {
    setState({ lang: null, error: false })
    setAttempt((n) => n + 1)
  }, [])

  const status: ParkDataStatus = state.lang === lang ? (state.error ? 'error' : 'ready') : 'loading'
  const value = useMemo(() => ({ bundle, status, reload }), [bundle, status, reload])
  return <ParkDataContext.Provider value={value}>{children}</ParkDataContext.Provider>
}

function useCtx(): ParkDataValue {
  const v = useContext(ParkDataContext)
  if (!v) throw new Error('useParkData buiten ParkDataProvider')
  return v
}

/** { bundle (kan null zijn), status }. Binnen <ParkDataGate> liever useBundle(). */
export function useParkData(): { bundle: ParkBundle | null; status: ParkDataStatus } {
  const { bundle, status } = useCtx()
  return { bundle, status }
}

/** Bundel zonder null; alleen binnen <ParkDataGate> (de routes die de bundel nodig hebben). */
export function useBundle(): ParkBundle {
  const { bundle } = useCtx()
  if (!bundle) throw new Error('useBundle buiten ParkDataGate')
  return bundle
}

export function useSpecies(slug: string | undefined): BundleSpecies | undefined {
  const { bundle } = useCtx()
  return useMemo(() => (slug ? bundle?.species.find((s) => s.slug === slug) : undefined), [bundle, slug])
}

export function usePlace(id: string | null | undefined): PlaceFeature | undefined {
  const { bundle } = useCtx()
  return useMemo(() => (id ? bundle?.places.features.find((f) => f.properties.id === id) : undefined), [bundle, id])
}

export function LoadingScreen() {
  const t = useT()
  return (
    <div className="state-screen" role="status" aria-live="polite" data-testid="park-loading">
      <div className="spinner" aria-hidden="true" />
      <p>{t('data.loading')}</p>
    </div>
  )
}

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <div className="state-screen" role="alert" data-testid="park-error">
      <h1>{t('data.error.title')}</h1>
      <p>{t('data.error.text')}</p>
      <button type="button" className="btn" onClick={onRetry}>
        {t('data.error.retry')}
      </button>
    </div>
  )
}

/** Route-wrapper: toont de kinderroute zodra de bundel er is; anders laad- of foutscherm. */
export function ParkDataGate() {
  const { bundle, status, reload } = useCtx()
  if (!bundle) return status === 'error' ? <ErrorScreen onRetry={reload} /> : <LoadingScreen />
  return <Outlet />
}
