import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useParkData } from '../../data/ParkDataProvider'
import { localized } from '../../i18n'
import { useSettings } from '../../state/settings'
import { useProgrammeT } from './i18n'
import { upcoming, type UpcomingItem } from './upcoming'
import { useNow } from './useNow'
import './programme.css'

const REMIND_BEFORE_MIN = 5
const MAX_ITEMS = 3
const itemKey = (i: UpcomingItem) => `${i.time}|${i.title.nl}`

function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}

/** Strook "Straks in het park" (docs/FASE-2.md §6.5). Leeg of geen bundel: niets tonen. */
export function ProgrammeStrip() {
  const { bundle } = useParkData()
  const { lang } = useSettings()
  const t = useProgrammeT()
  const now = useNow(30_000)
  const [reminded, setReminded] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((id) => clearTimeout(id))
      map.clear()
    }
  }, [])

  const items = upcoming(bundle?.programme, now).slice(0, MAX_ITEMS)

  const remind = useCallback(
    (item: UpcomingItem, title: string) => {
      const key = itemKey(item)
      if (timers.current.has(key)) return
      const delayMs = Math.max(0, (item.minutesUntil - REMIND_BEFORE_MIN) * 60_000)
      const id = setTimeout(() => {
        timers.current.delete(key)
        setMessage(fill(t('remind_msg'), { title }))
      }, delayMs)
      timers.current.set(key, id)
      setReminded((s) => new Set(s).add(key))
    },
    [t],
  )

  if (!bundle || items.length === 0) return null
  const programme = bundle.programme
  const link = bundle.park.links.programme ?? bundle.park.links.official_site
  const checked = new Date(programme.last_checked)
  const date = Number.isNaN(checked.getTime()) ? programme.last_checked : checked.toLocaleDateString(lang)

  return (
    <section className="card c-t pg-strip" aria-labelledby="pg-title" data-testid="programme-strip">
      <h2 id="pg-title">{t('title')}</h2>
      <ul className="pg-list">
        {items.map((item) => {
          const key = itemKey(item)
          const title = localized(item.title, lang)
          const place = item.place_id
            ? bundle.places.features.find((f) => f.properties.id === item.place_id)?.properties
            : undefined
          const placeName = place ? (lang === 'en' ? (place.name_en ?? place.name_nl) : place.name_nl) : null
          const when = item.minutesUntil === 0 ? t('now') : fill(t('in_min'), { n: item.minutesUntil })
          const on = reminded.has(key)
          return (
            <li key={key} className="pg-item">
              <span className="pg-when">{when}:</span>
              <span className="pg-what">
                {title}
                {placeName && item.place_id && (
                  <>
                    {' · '}
                    <Link to={`/kaart?plek=${encodeURIComponent(item.place_id)}`}>{placeName}</Link>
                  </>
                )}
              </span>
              <button type="button" className="pg-remind" aria-pressed={on} disabled={on} onClick={() => remind(item, title)}>
                {on ? t('reminded') : t('remind')}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="pg-toast" role="status" aria-live="polite">
        {message}
      </p>
      <p className="pg-note">{t('remind_note')}</p>
      <p className="pg-note">
        <a href={link} target="_blank" rel="noreferrer">
          {t('disclaimer')}
        </a>
        {' · '}
        {fill(t('checked'), { date })}
      </p>
    </section>
  )
}
