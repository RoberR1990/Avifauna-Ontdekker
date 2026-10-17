import { Link } from 'react-router-dom'
import { useBundle } from '../../data/ParkDataProvider'
import type { BundleExpedition } from '../../data/types'
import { useAlbum } from '../../state/album'
import { seasonActive } from '../expeditions/zone'
import { usePlayT } from './i18n'
import './play.css'

function ageLabel(age: BundleExpedition['age'], t: ReturnType<typeof usePlayT>): string {
  return age === 'all' ? t('age_all') : `${age} ${t('years')}`
}

export function PlayPage() {
  const t = usePlayT()
  const bundle = useBundle()
  const { album } = useAlbum()
  const list = (bundle.expeditions ?? []).filter((e) => seasonActive(e.season))

  return (
    <div className="play">
      <h1>{t('title')}</h1>
      <p className="lead">{t('lead')}</p>

      <section className="card c-v" aria-labelledby="play-exp">
        <h2 id="play-exp">{t('expeditions')}</h2>
        {list.length === 0 ? (
          <p className="note" data-testid="play-empty">
            {t('none')}
          </p>
        ) : (
          <ul className="play-list">
            {list.map((e) => {
              const prog = album.expeditions[e.id]
              const done = prog ? e.stops.filter((s) => prog.done[s.id]).length : 0
              const finished = Boolean(prog?.completed)
              return (
                <li key={e.id}>
                  <Link className="play-exp" to={`/expeditie/${e.id}`} data-done={finished || undefined}>
                    <span className="play-exp__icon" aria-hidden="true">
                      {e.badge.icon}
                    </span>
                    <span className="play-exp__body">
                      <span className="play-exp__title">{e.title}</span>
                      <span className="play-exp__meta">
                        {ageLabel(e.age, t)}
                        {e.minutes ? ` · ${e.minutes} ${t('minutes')}` : ''} · {e.stops.length} {t('stops')}
                      </span>
                    </span>
                    <span className="play-exp__prog">{finished ? t('done') : `${done}/${e.stops.length}`}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="tiles">
        <Link className="tile tile--teal" to="/bingo">
          <span className="tile__icon" aria-hidden="true">
            🎯
          </span>
          <span className="tile__title">{t('bingo')}</span>
          <span className="tile__sub">{t('bingo_sub')}</span>
        </Link>
        <Link className="tile tile--sun" to="/routes">
          <span className="tile__icon" aria-hidden="true">
            🧭
          </span>
          <span className="tile__title">{t('routes')}</span>
          <span className="tile__sub">{t('routes_sub')}</span>
        </Link>
        <Link className="tile tile--violet" to="/album">
          <span className="tile__icon" aria-hidden="true">
            📒
          </span>
          <span className="tile__title">{t('album')}</span>
          <span className="tile__sub">{t('album_sub')}</span>
        </Link>
      </div>
    </div>
  )
}
