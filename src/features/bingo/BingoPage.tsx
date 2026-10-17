import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { mediaUrl, useBundle } from '../../data/ParkDataProvider'
import { albumActions, today, useAlbum, type BingoCard } from '../../state/album'
import { completedLines, isFull, makeCard, seedFor, type CardSize } from './card'
import { useBingoT } from './i18n'
import { bingoLine } from './track-stubs'
import './bingo.css'

const BADGE_FULL = 'bingo-vol'

type Cheer = 'line' | 'full' | null

export function BingoPage() {
  const t = useBingoT()
  const bundle = useBundle()
  const bingo = bundle.bingo
  const { album, ready } = useAlbum()
  const [pending, setPending] = useState<CardSize | null>(null)
  const [cheer, setCheer] = useState<Cheer>(null)

  const day = today()
  const card = album.bingo && album.bingo.day === day ? album.bingo : null

  // Geen kaart van vandaag: maak er een (zelfde formaat als de vorige als dat mag, anders 3x3).
  useEffect(() => {
    if (!ready || !bingo) return
    if (album.bingo && album.bingo.day === day) return
    const sizes = bingo.sizes.length ? bingo.sizes : [9 as const]
    const prev = album.bingo?.size
    const keep = prev && sizes.includes(prev) ? prev : sizes.includes(9) ? 9 : sizes[0]
    albumActions.setBingo(makeCard(bingo, keep, seedFor(day, 0), day))
  }, [ready, bingo, album.bingo, day])

  const bySlug = useMemo(() => new Map(bundle.species.map((s) => [s.slug, s])), [bundle.species])
  const behaviours = useMemo(() => new Map((bingo?.behaviours ?? []).map((b) => [b.id, b])), [bingo])

  if (!bingo) {
    return (
      <div className="bg-page">
        <h1>{t('title')}</h1>
        <section className="card c-s" data-testid="bingo-empty">
          <h2>{t('empty_title')}</h2>
          <p>{t('empty_text')}</p>
        </section>
        <Link className="btn" to="/album">
          {t('album')}
        </Link>
      </div>
    )
  }

  function toggle(i: number) {
    if (!card) return
    const was = card.marked.includes(i)
    const marked = was ? card.marked.filter((m) => m !== i) : [...card.marked, i]
    let lines = card.lines
    if (!was) {
      const n = completedLines(marked, card.size).length
      if (n > card.lines) {
        lines = n
        bingoLine(card.size)
        setCheer('line')
      }
      const cell = card.cells[i]
      if (cell.startsWith('s:')) albumActions.addSticker(cell.slice(2))
      if (isFull(marked, card.size)) {
        albumActions.earnBadge(BADGE_FULL)
        setCheer('full')
      }
    }
    albumActions.setBingo({ ...card, marked, lines })
  }

  function newCard(next: CardSize, prev: BingoCard | null) {
    if (!bingo) return
    albumActions.setBingo(makeCard(bingo, next, seedFor(day, (prev?.seed ?? 0) + 1), day))
    setPending(null)
    setCheer(null)
  }

  function chooseSize(next: CardSize) {
    if (card && card.size === next) return
    if (card && card.marked.length > 0) setPending(next)
    else newCard(next, card)
  }

  const size = card?.size

  return (
    <div className="bg-page">
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>

      <div className="bg-bar">
        <div role="group" aria-label={t('size_label')} className="bg-bar">
          {bingo.sizes.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn${size === s ? ' on' : ''}`}
              aria-pressed={size === s}
              onClick={() => chooseSize(s)}
            >
              {t(s === 9 ? 'size9' : 'size16')}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--teal" onClick={() => setPending(size ?? 9)}>
          {t('new_card')}
        </button>
      </div>

      {pending && (
        <div className="bg-confirm" role="alertdialog" aria-label={t('new_card')} data-testid="bingo-confirm">
          <p>{t('confirm_text')}</p>
          <div className="bg-bar">
            <button type="button" className="btn btn--red" onClick={() => newCard(pending, card)}>
              {t('confirm_yes')}
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              {t('confirm_no')}
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite" role="status" data-testid="bingo-status">
        {cheer && (
          <div className="bg-cheer">
            <h2>{cheer === 'full' ? t('full') : t('bingo')}</h2>
            <p>{cheer === 'full' ? t('full_text') : t('bingo_text')}</p>
            <button type="button" className="btn" onClick={() => setCheer(null)}>
              {t('close')}
            </button>
          </div>
        )}
      </div>

      {card && (
        <>
          <p>
            {card.marked.length} / {card.size} {t('count')}
          </p>
          <ul className={`bg-grid bg-grid--${card.size}`} aria-label={t('card')}>
            {card.cells.map((cell, i) => {
              const on = card.marked.includes(i)
              const isSpecies = cell.startsWith('s:')
              const id = cell.slice(2)
              const sp = isSpecies ? bySlug.get(id) : undefined
              const bh = isSpecies ? undefined : behaviours.get(id)
              const label = sp?.name ?? bh?.label ?? id
              return (
                <li key={cell}>
                  <button
                    type="button"
                    className="bg-cell"
                    aria-pressed={on}
                    aria-label={`${label}, ${on ? t('marked') : t('not_marked')}`}
                    onClick={() => toggle(i)}
                  >
                    {sp?.photo ? (
                      <img src={mediaUrl(sp.photo.thumb_url)} alt="" loading="lazy" />
                    ) : bh ? (
                      <span className="bg-cell__icon" aria-hidden="true">
                        {bh.icon}
                      </span>
                    ) : null}
                    <span className="bg-cell__name" aria-hidden="true">
                      {label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Link className="btn" to="/album">
        {t('album')}
      </Link>
    </div>
  )
}
