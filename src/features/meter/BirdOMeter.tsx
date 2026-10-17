import { compareSpecies, type Comparison, type RefId } from './compare'
import { meterText } from './i18n'
import type { BundleSpecies, Lang } from '../../data/types'
import './meter.css'

// Silhouetten (viewBox-eenheden). Alles decoratief: de zin en het detail staan als tekst ernaast.
const KID = 'M30 3a13 13 0 1 1 0 26a13 13 0 0 1 0-26ZM18 34Q30 29 42 34L50 66 44 68 39 48 40 76 38 116H32L30 84 28 116H22L20 76 21 48 16 68 10 66Z' // 60x120
const KID_ARMS = 'M30 3a13 13 0 1 1 0 26a13 13 0 0 1 0-26ZM24 32H36L58 36 58 43 38 42 38 76 36 116H31L30 84 29 116H24L22 76 22 42 2 43 2 36Z' // 60x120
const BIRD = 'M8 40C8 30 18 26 24 26C26 16 36 10 46 14C50 16 52 20 56 22L66 24L56 28C56 40 48 50 38 54L40 70H34L30 56C22 56 16 54 12 50L2 56L4 46Z' // 70x72
const BIRD_WINGS = 'M60 40C50 22 28 14 2 18C14 22 22 30 28 38L22 42C28 44 34 44 40 42L46 58L52 42C58 44 64 44 68 42L62 38C68 30 76 22 88 18C92 16 100 22 118 18C96 14 74 22 60 40Z' // 120x66

interface Glyph {
  vb: [number, number]
  d: string[]
  fill?: string
  stroke?: boolean
}

function isPersonRef(ref: RefId): boolean {
  return ref === 'newborn' || ref === 'adult' || ref.startsWith('child-')
}

function glyph(ref: RefId, wing: boolean): Glyph {
  if (isPersonRef(ref)) return { vb: [60, 120], d: [wing ? KID_ARMS : KID], fill: 'var(--violet)' }
  switch (ref) {
    case 'milk':
      return { vb: [30, 52], d: ['M4 17 15 5 26 17V50H4Z', 'M9 14 15 2 21 14Z'], fill: 'var(--teal)', stroke: true }
    case 'apple':
      return { vb: [40, 44], d: ['M20 12C12 6 2 12 2 26C2 38 10 43 20 40C30 43 38 38 38 26C38 12 28 6 20 12Z', 'M20 12C20 6 22 3 26 1'], fill: 'var(--red, #e8452f)', stroke: true }
    case 'egg':
      return { vb: [30, 40], d: ['M15 2C6 2 2 20 2 26C2 34 8 38 15 38C22 38 28 34 28 26C28 20 24 2 15 2Z'], fill: 'var(--white)', stroke: true }
    case 'coin':
      return { vb: [30, 30], d: ['M15 2a13 13 0 1 1 0 26a13 13 0 0 1 0-26Z', 'M15 9a6 6 0 1 1 0 12a6 6 0 0 1 0-12Z'], fill: 'var(--sun)', stroke: true }
    case 'paperclip':
      return { vb: [16, 40], d: ['M5 30V8a4 4 0 0 1 8 0V32a6 6 0 0 1-12 0V12'], stroke: true }
    case 'a4':
      return { vb: [21, 30], d: ['M1 1H20V29H1Z'], fill: 'var(--white)', stroke: true }
    case 'card':
      return { vb: [9, 13], d: ['M1 1H8V12H1Z'], fill: 'var(--white)', stroke: true }
    default: // pen, lucifer: een staafje
      return { vb: [8, 30], d: ['M2 1H6V29H2Z'], fill: 'var(--sun)', stroke: true }
  }
}

/** Lengte in cm van voorwerpen, voor de verhouding in de tekening. */
const OBJ_CM: Partial<Record<RefId, number>> = { a4: 29.7, card: 8.9, pen: 15, match: 4.5 }

function Shape({ g, h, className }: { g: Glyph; h: number; className?: string }) {
  const w = (h * g.vb[0]) / g.vb[1]
  const lined = g.stroke || !g.fill
  return (
    <svg className={className} width={w} height={h} viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`} aria-hidden="true" focusable="false">
      {g.d.map((d, i) => (
        <path key={i} d={d} fill={g.fill ?? 'none'} stroke={lined ? 'var(--ink)' : 'none'} strokeWidth={lined ? 1.6 : 0} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

const BOX_H = 96

function Figure({ c }: { c: Comparison }) {
  const wing = c.kind === 'wingspan'
  const birdGlyph: Glyph = wing ? { vb: [120, 66], d: [BIRD_WINGS], fill: 'var(--ink)' } : { vb: [70, 72], d: [BIRD], fill: 'var(--ink)' }
  const ref = glyph(c.ref, wing)
  const person = isPersonRef(c.ref)

  if (c.kind === 'mass') {
    const n = c.count ?? 1
    const shown = Math.max(1, Math.min(5, Math.ceil(n)))
    const partial = n % 1 !== 0
    return (
      <>
        <Shape g={birdGlyph} h={64} />
        <span className="bom-eq">=</span>
        <span className="bom-stack">
          {Array.from({ length: shown }, (_, i) => (
            <Shape key={i} g={ref} h={person ? 70 : 38} className={n < 1 || (partial && i === shown - 1) ? 'bom-half' : undefined} />
          ))}
          {n > 5 && <b className="bom-n">×{String(n).replace('.', ',')}</b>}
        </span>
      </>
    )
  }
  // lengte/hoogte/spanwijdte: referentie naast vogel, hoogteverhouding = c.ratio
  const ratio = c.ratio
  const max = BOX_H - 6
  const refH = person ? Math.max(28, Math.min(max, max / Math.max(1, ratio))) : Math.max(12, Math.min(max, (OBJ_CM[c.ref] ?? 15) * 2.2))
  const birdH = Math.max(12, Math.min(max, refH * ratio))
  return (
    <>
      <Shape g={ref} h={refH} />
      <Shape g={birdGlyph} h={birdH} />
    </>
  )
}

export interface BirdOMeterProps {
  species: BundleSpecies
  lang: Lang
  /** false = alleen de rijen, zonder kaart en kop (de pagina levert die zelf). */
  card?: boolean
}

export function BirdOMeter({ species, lang, card = true }: BirdOMeterProps) {
  const rows = compareSpecies(species, lang)
  if (rows.length === 0) return null
  const body = (
    <div className="bom-rows">
      {rows.map((c) => (
        <div className="bom-row" key={c.kind}>
          <div className="bom-fig" aria-hidden="true">
            <Figure c={c} />
          </div>
          <p>
            {c.sentence}
            <small>{c.detail}</small>
          </p>
        </div>
      ))}
    </div>
  )
  if (!card) return body
  return (
    <section className="bom-card" aria-label={meterText[lang].aria}>
      <h2>{meterText[lang].title}</h2>
      {body}
    </section>
  )
}
