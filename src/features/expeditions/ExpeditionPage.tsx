import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { mediaUrl, useBundle, useSpecies } from '../../data/ParkDataProvider'
import type { BundleExpedition, BundleStop } from '../../data/types'
import type { PlaceFeature } from '../../park/types'
import { useAlbum } from '../../state/album'
import { useGeolocation } from '../map/useGeolocation'
import { useExpeditionT } from './i18n'
import { expeditionComplete, expeditionStart } from './track-stubs'
import { distanceToEdgeM, inZone } from './zone'
import './expedition.css'

type T = ReturnType<typeof useExpeditionT>
type Status = 'locked' | 'open' | 'done'

/** Na zo veel seconden zonder bruikbare fix (accuracy <= 50 m) komt de terugval "Ik sta er". */
const FALLBACK_AFTER_MS = 60_000
const GOOD_ACCURACY_M = 50

export function ExpeditionPage() {
  const { id } = useParams()
  const t = useExpeditionT()
  const bundle = useBundle()
  const exp = (bundle.expeditions ?? []).find((e) => e.id === id)
  if (!exp) {
    return (
      <div className="ex" data-testid="ex-unknown">
        <h1>{t('unknown_title')}</h1>
        <p>{t('unknown_text')}</p>
        <Link className="btn btn--teal" to="/spelen">
          {t('to_play')}
        </Link>
      </div>
    )
  }
  return <ExpeditionView key={exp.id} exp={exp} />
}

function ExpeditionView({ exp }: { exp: BundleExpedition }) {
  const t = useExpeditionT()
  const bundle = useBundle()
  const { album, markStop, completeExpedition, resetExpedition } = useAlbum()
  const prog = album.expeditions[exp.id]
  const doneMap = useMemo(() => prog?.done ?? {}, [prog])

  const [sel, setSel] = useState<string | null>(null)
  const [gps, setGps] = useState(false)
  const [unlocked, setUnlocked] = useState<ReadonlySet<string>>(() => new Set())
  const [manual, setManual] = useState<ReadonlySet<string>>(() => new Set())
  const [slow, setSlow] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [notice, setNotice] = useState('')

  const zones = useMemo(() => {
    const m = new Map<string, PlaceFeature>()
    for (const s of exp.stops) {
      const z = bundle.places.features.find((f) => f.properties.id === s.zone_id)
      if (z) m.set(s.id, z)
    }
    return m
  }, [bundle.places.features, exp.stops])

  const pending = (s: BundleStop) => !doneMap[s.id]
  const needsGps = (s: BundleStop) => !s.indoor && pending(s) && !manual.has(s.id) && !unlocked.has(s.id) && zones.has(s.id)
  const gpsOn = gps && exp.stops.some(needsGps)
  const { status: geo, fix } = useGeolocation(gpsOn)

  // Een stop die via GPS openging blijft open (de positie zelf wordt nergens bewaard).
  if (fix) {
    const hits = exp.stops.filter((s) => needsGps(s) && inZone(fix, zones.get(s.id)!)).map((s) => s.id)
    if (hits.length > 0) setUnlocked(new Set([...unlocked, ...hits]))
  }

  useEffect(() => {
    if (!gpsOn) return
    const timer = window.setTimeout(() => setSlow(true), FALLBACK_AFTER_MS)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [gpsOn])

  const statusOf = (s: BundleStop): Status =>
    doneMap[s.id] ? 'done' : s.indoor || manual.has(s.id) || unlocked.has(s.id) || !zones.has(s.id) ? 'open' : 'locked'

  const firstPending = exp.stops.find(pending)
  const active = exp.stops.find((s) => s.id === sel) ?? firstPending ?? null
  const doneCount = exp.stops.filter((s) => doneMap[s.id]).length
  const finished = Boolean(prog?.completed)

  const nearestId = useMemo(() => {
    if (!fix) return null
    let best: { id: string; d: number } | null = null
    for (const s of exp.stops) {
      const z = zones.get(s.id)
      if (!z || s.indoor || doneMap[s.id]) continue
      const d = inZone(fix, z) ? 0 : distanceToEdgeM(fix.lat, fix.lon, z)
      if (!best || d < best.d) best = { id: s.id, d }
    }
    return best?.id ?? null
  }, [fix, exp.stops, zones, doneMap])

  const goodFix = fix !== null && fix.accuracy <= GOOD_ACCURACY_M
  const fallback = gpsOn && (geo === 'denied' || geo === 'unavailable' || geo === 'error' || (slow && !goodFix))
  const geoText = geo === 'denied' ? t('gps_denied') : geo === 'unavailable' || geo === 'error' ? t('gps_unavailable') : slow && !goodFix ? t('gps_slow') : ''

  function solved(stop: BundleStop) {
    if (!prog) expeditionStart(exp.id)
    markStop(exp.id, stop.id)
    const allDone = exp.stops.every((s) => s.id === stop.id || doneMap[s.id])
    if (allDone) {
      completeExpedition(exp.id, exp.badge.id)
      expeditionComplete(exp.id)
    }
    setNotice(t('correct'))
    setSel(allDone ? stop.id : null)
  }

  function restart() {
    resetExpedition(exp.id)
    setUnlocked(new Set())
    setManual(new Set())
    setSel(null)
    setGps(false)
    setConfirmReset(false)
    setNotice('')
  }

  const activeStatus = active ? statusOf(active) : null

  return (
    <div className="ex">
      <Link className="ex-back" to="/spelen">
        ← {t('back')}
      </Link>
      <h1>
        <span aria-hidden="true">{exp.badge.icon} </span>
        {exp.title}
      </h1>
      <p className="lead">{exp.intro}</p>
      <p className="ex-progress" data-testid="ex-progress">
        {doneCount} {t('of')} {exp.stops.length} {t('progress')}
      </p>

      <p className="sr-only" role="status" aria-live="polite" data-testid="ex-notice">
        {notice}
      </p>

      {finished && (
        <section className="card c-s ex-party" aria-labelledby="ex-party-h" data-testid="ex-party">
          <h2 id="ex-party-h">{t('party_title')}</h2>
          <span className="ex-party__badge" aria-hidden="true">
            {exp.badge.icon}
          </span>
          <p>
            {t('party_badge')}: <strong>{exp.badge.name}</strong>
          </p>
          <Link className="btn btn--violet" to="/album">
            {t('to_album')}
          </Link>
        </section>
      )}

      <section className="card c-t" aria-labelledby="ex-stops-h">
        <h2 id="ex-stops-h">{t('stops')}</h2>
        <ol className="ex-stops">
          {exp.stops.map((s, i) => {
            const st = statusOf(s)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className="ex-stop"
                  data-status={st}
                  aria-current={active?.id === s.id ? 'step' : undefined}
                  onClick={() => setSel(s.id)}
                >
                  <span className="ex-stop__nr" aria-hidden="true">
                    {st === 'done' ? '✓' : i + 1}
                  </span>
                  <span className="ex-stop__title">{s.title}</span>{' '}
                  <span className="ex-stop__status">
                    {s.id === nearestId && st !== 'done' ? `${t('nearest')} · ` : ''}
                    {s.indoor && st !== 'done' ? `${t('indoor')} · ` : ''}
                    {t(st === 'locked' ? 's_locked' : st === 'open' ? 's_open' : 's_done')}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      {active && (
        <section className="card c-r" aria-labelledby="ex-active-h" data-testid="ex-active">
          <h2 id="ex-active-h">{active.title}</h2>
          {activeStatus === 'done' && <p className="ex-feedback" data-kind="ok">{t('s_done')} ✓</p>}
          {activeStatus === 'locked' && (
            <div>
              <p>{t('locked_text')}</p>
              {gpsOn ? (
                <button type="button" className="btn btn--ghost" onClick={() => setGps(false)}>
                  {t('stop_find')}
                </button>
              ) : (
                <button type="button" className="btn btn--teal" onClick={() => setGps(true)}>
                  {t('find_me')}
                </button>
              )}
              {gpsOn && (
                <p className="note" role="status" aria-live="polite">
                  {geo === 'searching' || geo === 'idle' ? t('searching') : ''} {geoText}
                </p>
              )}
              <p className="note">{t('gps_note')}</p>
              {fallback && (
                <button type="button" className="btn btn--violet" onClick={() => setManual(new Set([...manual, active.id]))}>
                  {t('here')}
                </button>
              )}
            </div>
          )}
          {activeStatus === 'open' && <StopTask key={active.id} stop={active} t={t} onSolved={() => solved(active)} />}
          <StopLinks stop={active} t={t} />
        </section>
      )}

      <div className="btn-row">
        {!confirmReset ? (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(true)}>
            {t('restart')}
          </button>
        ) : (
          <div role="alertdialog" aria-label={t('restart')}>
            <p>{t('restart_ask')}</p>
            <button type="button" className="btn btn--red" onClick={restart}>
              {t('restart_yes')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(false)}>
              {t('restart_no')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StopLinks({ stop, t }: { stop: BundleStop; t: T }) {
  const species = useSpecies(stop.species ?? undefined)
  return (
    <div>
      {species && (
        <Link className="ex-species" to={`/soort/${species.slug}`}>
          {species.photo && <img src={mediaUrl(species.photo.thumb_url)} alt="" width={72} height={72} loading="lazy" />}
          <span>
            {t('species')}: {species.name}
          </span>
        </Link>
      )}
      <Link className="btn btn--small btn--ghost" to={`/kaart?plek=${encodeURIComponent(stop.zone_id)}`}>
        {t('map')}
      </Link>
    </div>
  )
}

/** De opdracht van een open stop. Antwoorden blijven in dit component en worden nergens bewaard. */
function StopTask({ stop, t, onSolved }: { stop: BundleStop; t: T; onSolved: () => void }) {
  const { type, prompt, options, answer, hint } = stop.task
  const [num, setNum] = useState(0)
  const [text, setText] = useState('')
  const [wrong, setWrong] = useState(false)

  const fail = () => setWrong(true)
  const feedback = wrong ? hint || t('wrong') : ''

  return (
    <div>
      <p className="ex-prompt">{prompt}</p>

      {(type === 'find' || type === 'look') && (
        <button type="button" className="btn btn--teal" onClick={onSolved}>
          {t('found')}
        </button>
      )}

      {type === 'count' && (
        <>
          <div className="ex-count" role="group" aria-label={t('how_many')}>
            <button type="button" className="ex-count__btn" aria-label={t('less')} onClick={() => setNum(Math.max(0, num - 1))}>
              −
            </button>
            <output className="ex-count__value" aria-live="polite">
              {num}
            </output>
            <button type="button" className="ex-count__btn" aria-label={t('more')} onClick={() => setNum(num + 1)}>
              +
            </button>
          </div>
          <button
            type="button"
            className="btn btn--teal"
            onClick={() => (answer === null || num === answer ? onSolved() : fail())}
          >
            {answer === null ? t('ready') : t('check')}
          </button>
        </>
      )}

      {type === 'answer' && (
        <>
          <label className="note" htmlFor={`ex-ans-${stop.id}`}>
            {t('open_label')}
          </label>
          <textarea
            id={`ex-ans-${stop.id}`}
            className="ex-textarea"
            value={text}
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" className="btn btn--teal" onClick={onSolved}>
            {t('ready')}
          </button>
        </>
      )}

      {type === 'choose' && (
        <div className="ex-options">
          {(options ?? []).map((o, i) => (
            <button key={i} type="button" className="btn btn--ghost" onClick={() => (i === answer ? onSolved() : fail())}>
              {o}
            </button>
          ))}
        </div>
      )}

      <p className="ex-feedback" data-kind={wrong ? 'wrong' : undefined} role="status" aria-live="polite">
        {feedback}
      </p>
    </div>
  )
}
