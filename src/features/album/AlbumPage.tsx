import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { mediaUrl, useBundle } from '../../data/ParkDataProvider'
import { today, useAlbum } from '../../state/album'
import { useSettings } from '../../state/settings'
import { allBadges } from './badges'
import { fill, useAlbumT } from './i18n'
import { downloadBlob, renderSheet } from './sheet'
import { syncBadges } from './sync'
import { albumExport } from './track-stubs'
import './album.css'

export function AlbumPage() {
  const t = useAlbumT()
  const bundle = useBundle()
  const { lang } = useSettings()
  const { album, ready, persistent, exportFile, importFile } = useAlbum()
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const total = bundle.species.length
  const foundHere = bundle.species.filter((s) => album.stickers[s.slug]).length

  useEffect(() => {
    if (ready) syncBadges(bundle)
  }, [ready, foundHere, bundle])

  const badges = useMemo(() => allBadges(bundle, (k) => t(k as never)), [bundle, t])
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }), [lang])
  const fmt = (iso: string) => dateFmt.format(new Date(`${iso}T12:00:00`))
  const todayCount = album.days[today()]?.seen.length ?? 0

  const doBackup = () => {
    exportFile(bundle.park.id)
    albumExport('json')
    setMessage(null)
  }

  const doRestore = async (file: File | undefined) => {
    if (!file) return
    const r = await importFile(file, bundle.park.id)
    if (r.ok) setMessage(fill(t('restore.ok'), { n: r.added }))
    else setMessage(r.reason === 'other-park' ? t('restore.otherPark') : t('restore.invalid'))
    if (fileRef.current) fileRef.current.value = ''
  }

  const doImage = async () => {
    const items = bundle.species
      .filter((s) => album.stickers[s.slug])
      .map((s) => ({ name: s.name, date: fmt(album.stickers[s.slug].first), photoUrl: s.photo ? mediaUrl(s.photo.thumb_url) : null }))
    if (!items.length) {
      setMessage(t('image.empty'))
      return
    }
    setMessage(t('image.busy'))
    try {
      const blob = await renderSheet(`${t('sheet.title')} · ${bundle.park.app_name}`, items)
      if (!blob) throw new Error('geen canvas')
      downloadBlob(blob, `stickervel-${bundle.park.id}-${today()}.png`)
      albumExport('png')
      setMessage(null)
    } catch {
      setMessage(t('image.failed'))
    }
  }

  const doPrint = () => {
    albumExport('print')
    window.print()
  }

  return (
    <div className="album-page" data-testid="album-page">
      <h1>{t('title')}</h1>

      <p className="album-warning" role="note">
        {t('warning')}
      </p>
      {ready && !persistent && (
        <p className="album-warning album-warning--bad" role="alert">
          {t('notPersistent')}
        </p>
      )}

      <p className="album-count" aria-label={t('countLabel')} data-testid="album-count">
        <strong>{fill(t('count'), { n: foundHere, total })}</strong>
      </p>

      {todayCount > 0 && (
        <Link className="btn btn--teal" to="/vandaag">
          {fill(t('today'), { n: todayCount })}
        </Link>
      )}

      <section className="album-sheet" aria-labelledby="album-stickers">
        <h2 id="album-stickers">{t('stickers')}</h2>
        <ul className="album-grid">
          {bundle.species.map((s, i) => {
            const e = album.stickers[s.slug]
            const tilt = (((i * 7) % 5) - 2) * 0.8
            if (!e)
              return (
                <li key={s.slug} className="album-sticker album-sticker--empty" style={{ rotate: `${tilt}deg` }} data-testid="sticker-empty">
                  <div className="album-sticker__img" role="img" aria-label={t('unknown')}>
                    <span aria-hidden="true">?</span>
                  </div>
                </li>
              )
            return (
              <li key={s.slug} className="album-sticker" style={{ rotate: `${tilt}deg` }} data-testid="sticker-found">
                <Link to={`/soort/${s.slug}`} className="album-sticker__link">
                  <div className="album-sticker__img">
                    {s.photo ? <img src={mediaUrl(s.photo.thumb_url)} alt={s.name} loading="lazy" decoding="async" /> : <span aria-hidden="true">🐦</span>}
                  </div>
                  <span className="album-sticker__name">{s.name}</span>
                  <span className="album-sticker__date">{fmt(e.first)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card c-r" aria-labelledby="album-badges">
        <h2 id="album-badges">{t('badges')}</h2>
        <ul className="album-badges">
          {badges.map((b) => {
            const got = album.badges[b.id]
            return (
              <li key={b.id} className={got ? 'album-badge is-earned' : 'album-badge'} data-testid={got ? 'badge-earned' : 'badge-locked'}>
                <span className="album-badge__icon" aria-hidden="true">
                  {b.icon}
                </span>
                <span className="album-badge__text">
                  <strong>{b.name}</strong>
                  <span>{got ? fill(t('earned'), { date: fmt(got.earned) }) : `${t('notEarned')}: ${b.how}`}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card c-t album-tools" aria-labelledby="album-tools">
        <h2 id="album-tools">{t('tools')}</h2>
        <button type="button" className="btn" onClick={doBackup}>
          {t('backup')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
          {t('restore')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="album-file"
          aria-label={t('restore')}
          data-testid="album-file"
          tabIndex={-1}
          onChange={(e) => void doRestore(e.target.files?.[0])}
        />
        <button type="button" className="btn btn--ghost" onClick={() => void doImage()}>
          {t('image')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={doPrint}>
          {t('print')}
        </button>
        <p className="album-message" role="status" aria-live="polite" data-testid="album-message">
          {message}
        </p>
      </section>
    </div>
  )
}
