import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../../data/ParkDataProvider'
import type { BundleAttribution, BundleSpecies, Lang, Level } from '../../data/types'
import { isSupported, speak, stop } from '../../lib/speech'
import { useSpeciesT } from './i18n'
import { readAloud, soundPlay } from './track-stubs'

/** Maker, licentie (link), bron (link) en "bewerkt" direct onder een foto of bij een geluid. */
export function AttributionLine({ attribution, kind }: { attribution: BundleAttribution | undefined; kind: 'photo' | 'audio' }) {
  const t = useSpeciesT()
  if (!attribution) return null
  const a = attribution
  return (
    <p className="sp-credit" data-testid={`credit-${kind}`}>
      <span>{kind === 'photo' ? t('attr.photo') : t('attr.sound')}: </span>
      {a.creator}
      {' · '}
      {a.license_url ? (
        <a href={a.license_url} rel="noopener noreferrer">
          {a.license}
        </a>
      ) : (
        a.license
      )}
      {' · '}
      <a href={a.source_url} rel="noopener noreferrer">
        {a.source === 'xeno-canto' ? t('attr.via') : t('attr.source')}
      </a>
      {a.modified && <> · {t('attr.edited')}</>}
    </p>
  )
}

/** Voorleesknop; verborgen zonder speechSynthesis. Stopt bij unmount of wanneer `text` verandert. */
export function ReadAloudButton({ text, lang, level }: { text: string; lang: Lang; level: Level }) {
  const t = useSpeciesT()
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    return () => {
      stop()
      setSpeaking(false)
    }
  }, [text, level, lang])
  if (!isSupported() || !text.trim()) return null
  const toggle = () => {
    if (speaking) {
      stop()
      setSpeaking(false)
      return
    }
    if (speak(text, lang, level, () => setSpeaking(false))) {
      setSpeaking(true)
      readAloud(level)
    }
  }
  return (
    <button type="button" className="btn btn--teal sp-read" aria-pressed={speaking} onClick={toggle}>
      <span aria-hidden="true">{speaking ? '■' : '🔊'}</span> {speaking ? t('read.stop') : t('read.start')}
    </button>
  )
}

/** Eigen grote afspeelknop; opus met m4a als alternatief. */
export function SoundPlayer({ species }: { species: BundleSpecies }) {
  const t = useSpeciesT()
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const el = ref.current
    return () => {
      if (el && !el.paused) el.pause()
    }
  }, [])
  const audio = species.audio
  if (!audio || (!audio.opus_url && !audio.m4a_url)) return null
  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (playing) {
      el.pause()
      return
    }
    stop()
    soundPlay(species.slug)
    void Promise.resolve(el.play()).catch(() => setPlaying(false))
  }
  return (
    <>
      <audio
        ref={ref}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      >
        {audio.opus_url && <source src={mediaUrl(audio.opus_url)} type='audio/ogg; codecs="opus"' />}
        {audio.m4a_url && <source src={mediaUrl(audio.m4a_url)} type="audio/mp4" />}
      </audio>
      <button type="button" className="btn btn--violet sp-play" aria-pressed={playing} onClick={toggle}>
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span> {playing ? t('sound.pause') : t('sound.play')}
      </button>
    </>
  )
}
