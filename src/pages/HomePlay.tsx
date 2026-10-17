// Spelkaarten op Start (fase 2): "Ga verder met je expeditie" en "Vandaag gezien".
// Apart (lazy) geladen, zodat het album niet in de kern zit.
import { Link } from 'react-router-dom'
import { useParkData } from '../data/ParkDataProvider'
import { useT } from '../i18n'
import { today, useAlbum } from '../state/album'

export function HomePlay() {
  const t = useT()
  const { bundle } = useParkData()
  const { album, ready } = useAlbum()
  if (!ready || !bundle) return null

  const open = bundle.expeditions
    .map((e) => ({ e, p: album.expeditions[e.id] }))
    .filter(({ p }) => p && !p.completed)
    .sort((a, b) => (a.p!.started < b.p!.started ? 1 : -1))[0]
  const seenToday = album.days[today()]?.seen.length ?? 0

  if (!open && seenToday === 0) return null
  return (
    <div className="home-play">
      {open && (
        <Link to={`/expeditie/${open.e.id}`} className="card c-t home-play__card">
          <span className="home-play__icon" aria-hidden="true">{open.e.badge.icon}</span>
          <span>
            <strong>{t('home.continue')}</strong>
            <span className="home-play__sub">
              {open.e.title} · {Object.keys(open.p!.done).length}/{open.e.stops.length}
            </span>
          </span>
        </Link>
      )}
      {seenToday > 0 && (
        <Link to="/vandaag" className="card c-s home-play__card">
          <span className="home-play__icon" aria-hidden="true">📸</span>
          <span>
            <strong>{t('home.today')}</strong>
            <span className="home-play__sub">{t('home.today.sub').replace('{n}', String(seenToday))}</span>
          </span>
        </Link>
      )}
    </div>
  )
}
