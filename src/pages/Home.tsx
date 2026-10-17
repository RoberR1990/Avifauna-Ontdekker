import { lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { mediaUrl, useParkData } from '../data/ParkDataProvider'
import { useT } from '../i18n'
import { birdOfTheDay } from '../lib/bird-of-day'
import { OfflineDownloadButton } from '../offline/OfflineDownloadButton'
import { park } from '../park'

const HomePlay = lazy(() => import('./HomePlay').then((m) => ({ default: m.HomePlay })))
const ProgrammeStrip = lazy(() => import('../features/programme/ProgrammeStrip').then((m) => ({ default: m.ProgrammeStrip })))

export function Home() {
  const t = useT()
  const { bundle } = useParkData()
  const today = new Date().toDateString()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- today houdt de keuze per dag vast
  const bird = useMemo(() => (bundle ? birdOfTheDay(bundle.species) : null), [bundle, today])

  return (
    <>
      <h1 className="home-title">{t('home.title')}</h1>
      <div className="tiles">
        <Link to="/atlas" className="tile tile--violet">
          <span className="tile__icon" aria-hidden="true">📖</span>
          <span className="tile__title">{t('home.tile.atlas')}</span>
          <span className="tile__sub">{t('home.tile.atlas.sub')}</span>
        </Link>
        <Link to="/kaart" className="tile tile--teal">
          <span className="tile__icon" aria-hidden="true">🗺️</span>
          <span className="tile__title">{t('home.tile.map')}</span>
          <span className="tile__sub">{t('home.tile.map.sub')}</span>
        </Link>
        <Link to="/spelen" className="tile tile--sun">
          <span className="tile__icon" aria-hidden="true">🧭</span>
          <span className="tile__title">{t('home.tile.play')}</span>
          <span className="tile__sub">{t('home.tile.play.sub')}</span>
        </Link>
      </div>

      <Suspense fallback={null}>
        <HomePlay />
        <ProgrammeStrip />
      </Suspense>

      {bird && (
        <section className="card c-r botd" aria-labelledby="botd-h">
          <h2 id="botd-h">{t('home.botd')}</h2>
          <Link to={`/soort/${bird.slug}`} className="botd__link">
            {bird.photo && (
              <img src={mediaUrl(bird.photo.thumb_url)} alt="" width="96" height="96" loading="lazy" />
            )}
            <span>
              <strong className="botd__name">{bird.name}</strong>
              <em className="latin">{bird.scientific_name}</em>
            </span>
          </Link>
        </section>
      )}

      {bundle && bundle.media_manifest.length > 0 && (
        <section className="card c-v" aria-labelledby="offline-h">
          <h2 id="offline-h">{t('home.offline')}</h2>
          <OfflineDownloadButton />
        </section>
      )}

      <p className="note">{park.park_name}</p>
    </>
  )
}
