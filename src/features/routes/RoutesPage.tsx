import { Link } from 'react-router-dom'
import { useBundle } from '../../data/ParkDataProvider'
import type { BundleRoute } from '../../data/types'
import { useRoutesT } from './i18n'
import './routes.css'

const PROFILE_ICON: Record<BundleRoute['profile'], string> = {
  stroller: '🚼',
  rain: '☔',
  short: '🐣',
  all: '🗺️',
}

/** "850 m" onder de kilometer, anders "1,2 km". */
export function formatLength(m: number, lang: 'nl' | 'en'): string {
  if (m < 1000) return `${Math.round(m)} m`
  const km = (Math.round(m / 100) / 10).toFixed(1)
  return `${lang === 'nl' ? km.replace('.', ',') : km} km`
}

export function RoutesPage() {
  const bundle = useBundle()
  const t = useRoutesT()
  const routes = bundle.routes ?? []
  return (
    <>
      <h1>{t('title')}</h1>
      {routes.length === 0 ? (
        <p className="note" data-testid="routes-empty">
          {t('empty')}
        </p>
      ) : (
        <>
          <p>{t('intro')}</p>
          <ul className="rt-list">
            {routes.map((r) => (
              <RouteCard key={r.id} route={r} lang={bundle.lang} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function RouteCard({ route: r, lang }: { route: BundleRoute; lang: 'nl' | 'en' }) {
  const t = useRoutesT()
  return (
    <li className="card" data-testid="route-card" data-route={r.id}>
      <div className="rt-head">
        <span className="rt-icon" role="img" aria-label={t(`p_${r.profile}` as 'p_all')}>
          {PROFILE_ICON[r.profile]}
        </span>
        <h2>{r.title}</h2>
      </div>
      {r.concept && <p className="rt-concept">{t('concept')}</p>}
      <p>{r.intro}</p>
      <ul className="rt-meta">
        <li>{formatLength(r.length_m, lang)}</li>
        <li>
          {r.minutes} {t('minutes')}
        </li>
        <li>
          {r.stops.length} {t('stops_count')}
        </li>
      </ul>
      <ol className="rt-stops" aria-label={t('stops')}>
        {r.stops.map((s, i) => (
          <li key={`${s.place_id}-${i}`}>
            {s.name}
            {s.indoor && (
              <span className="rt-in" role="img" aria-label={t('indoor')} title={t('indoor')}>
                🏠
              </span>
            )}
          </li>
        ))}
      </ol>
      {r.note && <p className="rt-note">{r.note}</p>}
      <Link className="btn" to={`/kaart?route=${encodeURIComponent(r.id)}`}>
        {t('show')}
      </Link>
    </li>
  )
}
