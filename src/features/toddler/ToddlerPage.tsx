import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mediaUrl, useBundle } from '../../data/ParkDataProvider'
import type { AudioRef, BundleSpecies } from '../../data/types'
import { speak, stop as stopSpeech } from '../../lib/speech'
import { useSettings } from '../../state/settings'
import { useToddlerT } from './i18n'
import { soundPlay, toddlerMode } from './track-stubs'
import './toddler.css'

/** 0,01 s stilte (WAV), om het audio-element op iOS te ontgrendelen. */
function playUrl(a: HTMLAudioElement, url: string) {
  a.src = url
  try {
    a.play()?.catch(() => {})
  } catch {
    // geen audio-ondersteuning (bv. testomgeving)
  }
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

const HOLD_MS = 1000
const SWIPE_PX = 50

function pickAudioUrl(audio: AudioRef | null): string | null {
  if (!audio) return null
  const probe = typeof Audio === 'undefined' ? null : new Audio()
  const canOpus = probe
    ? probe.canPlayType('audio/ogg; codecs=opus') !== '' || probe.canPlayType('audio/webm; codecs=opus') !== ''
    : false
  const rel = canOpus ? (audio.opus_url ?? audio.m4a_url) : (audio.m4a_url ?? audio.opus_url)
  return rel ? mediaUrl(rel) : null
}

/** Houd 1 seconde ingedrukt (of Enter/spatie via toetsenbord) zodat een peuter er niet per ongeluk uit gaat. */
function DoneButton({ onDone }: { onDone: () => void }) {
  const t = useToddlerT()
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | null>(null)
  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }, [])
  useEffect(() => cancel, [cancel])
  return (
    <div className="td-done">
      <button
        type="button"
        className="td-done-btn"
        data-holding={holding || undefined}
        aria-label={`${t('done')}. ${t('done_hold')}`}
        onPointerDown={() => {
          setHolding(true)
          timer.current = window.setTimeout(onDone, HOLD_MS)
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onDone()
          }
        }}
      >
        <span className="td-done-fill" aria-hidden="true" />
        <span className="td-done-label">{t('done')}</span>
      </button>
      <p className="td-parent">{t('parent')}</p>
    </div>
  )
}

function Arrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={dir === 'right' ? 'M9 4l8 8-8 8' : 'M15 4l-8 8 8 8'} />
    </svg>
  )
}

export function ToddlerPage() {
  const t = useToddlerT()
  const { lang } = useSettings()
  const bundle = useBundle()
  const navigate = useNavigate()
  const animals = useMemo(() => bundle.species.filter((s) => s.photo), [bundle.species])
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)

  const index = openSlug ? animals.findIndex((s) => s.slug === openSlug) : -1
  const current: BundleSpecies | null = index >= 0 ? animals[index] : null

  const stopAll = useCallback(() => {
    stopSpeech()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  // iOS staat play() alleen toe binnen een tik. Het geluid start pas na het voorlezen,
  // dus ontgrendelen we bij de eerste tik één gedeeld audio-element (stil fragment) en hergebruiken dat.
  const sharedAudio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    const unlock = () => {
      if (sharedAudio.current || typeof Audio === 'undefined') return
      const a = new Audio()
      sharedAudio.current = a
      playUrl(a, SILENT_WAV)
    }
    window.addEventListener('pointerdown', unlock, { capture: true })
    return () => window.removeEventListener('pointerdown', unlock, { capture: true })
  }, [])

  const playSound = useCallback((s: BundleSpecies) => {
    const url = pickAudioUrl(s.audio)
    if (!url) return
    const a = sharedAudio.current ?? new Audio()
    audioRef.current = a
    soundPlay(s.slug)
    playUrl(a, url)
  }, [])

  const hear = useCallback(
    (s: BundleSpecies) => {
      stopAll()
      const spoke = speak(s.name, lang, 'kind', () => playSound(s))
      if (!spoke) playSound(s)
    },
    [lang, playSound, stopAll],
  )

  useEffect(() => {
    toddlerMode(true)
    return () => {
      toddlerMode(false)
      stopAll()
    }
  }, [stopAll])

  // Voorlezen + geluid zodra een dier opengaat of wisselt.
  useEffect(() => {
    if (current) hear(current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.slug])

  const step = useCallback(
    (delta: number) => {
      if (animals.length === 0 || index < 0) return
      setOpenSlug(animals[(index + delta + animals.length) % animals.length].slug)
    },
    [animals, index],
  )

  const close = useCallback(() => {
    stopAll()
    setOpenSlug(null)
  }, [stopAll])

  const done = useCallback(() => {
    stopAll()
    navigate('/')
  }, [navigate, stopAll])

  function attribution(s: BundleSpecies): string | null {
    if (!s.photo) return null
    const a = bundle.attributions[s.photo.attribution]
    return a ? `${t('photo_by')}: ${a.creator} · ${a.license}` : null
  }

  const attr = current ? attribution(current) : null

  return (
    <div className="toddler">
      {animals.length === 0 ? (
        <p className="td-empty">{t('empty')}</p>
      ) : (
        <ul className="td-grid" aria-label={t('grid')}>
          {animals.map((s) => (
            <li key={s.slug}>
              <button type="button" className="td-tile" onClick={() => setOpenSlug(s.slug)} aria-label={s.name}>
                <img src={mediaUrl(s.photo!.thumb_url)} alt="" loading="lazy" draggable={false} />
                <span className="td-tile-name">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <DoneButton onDone={done} />

      {current && (
        <div
          className="td-detail"
          role="dialog"
          aria-modal="true"
          aria-label={current.name}
          onPointerDown={(e) => {
            swipe.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={(e) => {
            const s = swipe.current
            swipe.current = null
            if (!s) return
            const dx = e.clientX - s.x
            const dy = e.clientY - s.y
            if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1)
          }}
          onPointerCancel={() => {
            swipe.current = null
          }}
        >
          <div className="td-photo">
            <img src={mediaUrl(current.photo!.url)} alt={current.name} draggable={false} />
          </div>
          <h1 className="td-name">{current.name}</h1>
          <div className="td-controls">
            <button type="button" className="td-round" onClick={close} aria-label={t('back')}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
              </svg>
            </button>
            <button type="button" className="td-round" onClick={() => step(-1)} aria-label={t('prev')}>
              <Arrow dir="left" />
            </button>
            <button type="button" className="td-round td-round--main" onClick={() => hear(current)} aria-label={t('again')}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
              </svg>
            </button>
            <button type="button" className="td-round td-round--main" onClick={() => step(1)} aria-label={t('next')}>
              <Arrow dir="right" />
            </button>
          </div>
          {attr && <p className="td-attr">{attr}</p>}
        </div>
      )}
    </div>
  )
}
