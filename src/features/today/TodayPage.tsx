import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { mediaUrl, useBundle } from '../../data/ParkDataProvider'
import type { BundleSpecies, ParkBundle } from '../../data/types'
import { today, useAlbum } from '../../state/album'
import { useSettings } from '../../state/settings'
import { CARD_H, CARD_W, MAX_THUMBS, drawCard, loadImage, type CardData, type CardPhoto, type CardSpecies } from './card'
import { useTodayT } from './i18n'
import { cardShare } from './track-stubs'
import './today.css'

const APP_BADGE_IDS = ['eerste-sticker', 'tien-stickers', 'helft', 'alle-confirmed', 'drie-werelddelen', 'bingo-vol'] as const

function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}

function photoMeta(bundle: ParkBundle, sp: BundleSpecies): { url: string; creator: string; license: string } | null {
  if (!sp.photo) return null
  const a = bundle.attributions[sp.photo.attribution]
  return { url: mediaUrl(sp.photo.thumb_url), creator: a?.creator ?? '', license: a?.license ?? '' }
}

async function toCardSpecies(bundle: ParkBundle, sp: BundleSpecies): Promise<CardSpecies> {
  const meta = photoMeta(bundle, sp)
  if (!meta) return { name: sp.name, photo: null }
  const img = await loadImage(meta.url)
  const photo: CardPhoto = { img, creator: meta.creator, license: meta.license }
  return { name: sp.name, photo }
}

export function TodayPage() {
  const bundle = useBundle()
  const { lang } = useSettings()
  const t = useTodayT()
  const { album, ready, setFavourite } = useAlbum()
  const day = today()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [blob, setBlob] = useState<Blob | null>(null)

  const entry = album.days[day]
  const seen = useMemo(
    () => (entry?.seen ?? []).map((slug) => bundle.species.find((s) => s.slug === slug)).filter((s): s is BundleSpecies => !!s),
    [entry, bundle],
  )
  const favSlug = seen.some((s) => s.slug === entry?.favourite) ? entry?.favourite : seen[0]?.slug
  const newBadges = useMemo(() => {
    const own = (id: string) => {
      const known = bundle.expeditions?.find((e) => e.badge.id === id)?.badge.name
      if (known) return known
      return (APP_BADGE_IDS as readonly string[]).includes(id) ? t(`badge.${id}` as `badge.${(typeof APP_BADGE_IDS)[number]}`) : id
    }
    return Object.entries(album.badges)
      .filter(([, b]) => b.earned === day)
      .map(([id]) => own(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album.badges, bundle, day, lang])

  const slugKey = seen.map((s) => s.slug).join(',')
  const badgeKey = newBadges.join('|')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || seen.length === 0) {
      setBlob(null)
      return
    }
    let cancelled = false
    void (async () => {
      const fav = seen.find((s) => s.slug === favSlug) ?? seen[0]
      const others = seen.filter((s) => s !== fav).slice(0, MAX_THUMBS)
      const [favourite, thumbs] = await Promise.all([toCardSpecies(bundle, fav), Promise.all(others.map((s) => toCardSpecies(bundle, s)))])
      if (cancelled) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const data: CardData = {
        appName: bundle.park.app_name,
        parkName: bundle.park.park_name,
        unofficial: t('unofficial'),
        dateLabel: new Date().toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        countLabel: seen.length === 1 ? t('seen_one') : fill(t('seen_count'), { n: seen.length }),
        favouriteLabel: t('favourite'),
        favourite,
        thumbs,
        badgesLabel: t('badges'),
        badges: newBadges,
        photosLabel: t('photos'),
      }
      drawCard(ctx, data)
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((b) => {
          if (!cancelled) setBlob(b)
        }, 'image/png')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, ready, slugKey, favSlug, badgeKey, lang])

  const fileName = `vandaag-gezien-${day}.png`
  const file = useMemo(() => (blob && typeof File !== 'undefined' ? new File([blob], fileName, { type: 'image/png' }) : null), [blob, fileName])
  const canShare = !!file && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  const share = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: bundle.park.app_name })
      cardShare('share')
    } catch {
      // geannuleerd door de gebruiker: geen melding nodig
    }
  }

  const save = () => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    cardShare('download')
  }

  if (!ready) {
    return (
      <>
        <h1>{t('title')}</h1>
        <p role="status">{t('loading')}</p>
      </>
    )
  }

  if (seen.length === 0) {
    return (
      <>
        <h1>{t('title')}</h1>
        <section className="card c-s" data-testid="today-empty">
          <h2>{t('empty_title')}</h2>
          <p>{t('empty_text')}</p>
          <div className="btn-row">
            <Link className="btn btn--teal" to="/atlas">
              {t('to_atlas')}
            </Link>
            <Link className="btn btn--violet" to="/bingo">
              {t('to_bingo')}
            </Link>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <h1>{t('title')}</h1>
      <section className="card c-v" aria-labelledby="td-list">
        <h2 id="td-list">{seen.length === 1 ? t('seen_one') : fill(t('seen_count'), { n: seen.length })}</h2>
        <ul className="ty-list" aria-label={t('list')}>
          {seen.map((s) => {
            const meta = photoMeta(bundle, s)
            const isFav = s.slug === favSlug
            return (
              <li key={s.slug} className="ty-row">
                {meta ? <img className="ty-thumb" src={meta.url} alt="" loading="lazy" width="56" height="56" /> : <span className="ty-thumb ty-thumb--none" aria-hidden="true" />}
                <span className="ty-name">{s.name}</span>
                <button
                  type="button"
                  className="ty-fav"
                  aria-pressed={isFav}
                  aria-label={`${isFav ? t('is_favourite') : t('make_favourite')}: ${s.name}`}
                  onClick={() => setFavourite(day, s.slug)}
                >
                  {isFav ? '★' : '☆'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
      <section className="card c-t" aria-labelledby="td-preview">
        <h2 id="td-preview">{t('preview')}</h2>
        <canvas ref={canvasRef} className="ty-canvas" width={CARD_W} height={CARD_H} role="img" aria-label={t('preview_alt')} />
        <div className="btn-row">
          {canShare && (
            <button type="button" className="btn btn--violet" onClick={share}>
              {t('share')}
            </button>
          )}
          <button type="button" className="btn btn--teal" onClick={save} disabled={!blob}>
            {t('save')}
          </button>
        </div>
        <p className="ty-note">{t('privacy')}</p>
      </section>
    </>
  )
}
