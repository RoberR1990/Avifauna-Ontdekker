import { CONTINENT_PATHS, WORLD_VIEWBOX } from './continents'
import { arcPath, formatKm, haversineKm, project, roundDistanceKm, type LatLon } from './geo'
import { originText } from './i18n'
import type { BundleSpecies, Continent, Lang } from '../../data/types'
import './origin.css'

export interface OriginMapProps {
  species: BundleSpecies
  lang: Lang
  /** Middelpunt van het park (park.center of zwaartepunt van de places). */
  parkCenter?: LatLon | null
  /** Naam van het park voor het label bij de pin (optioneel). */
  parkName?: string
}

const ORDER = Object.keys(CONTINENT_PATHS) as Continent[]

export function OriginMap({ species, lang, parkCenter, parkName }: OriginMapProps) {
  const facts = species.facts
  const continents = facts?.continents ?? []
  const center = facts?.range_center ?? null
  if (continents.length === 0 && !center) return null

  const tx = originText[lang]
  const km = center && parkCenter ? roundDistanceKm(haversineKm(center, parkCenter)) : null
  const pin = center ? project(center) : null
  const home = parkCenter ? project(parkCenter) : null
  const kmLabel = km !== null ? `± ${formatKm(km, lang)} km` : null

  const where = continents.map((c) => tx.continents[c]).join(', ')
  const alt =
    `${tx.mapOf} ${species.name}` +
    (where ? `: ${tx.livesIn} ${where}.` : '.') +
    (kmLabel && parkName ? ` ${parkName} ${tx.is} ${kmLabel.replace('± ', tx.about + ' ')} ${tx.away}.` : '')

  // Label links of rechts van de pin, afhankelijk van de ruimte.
  const labelSide = (p: [number, number]) => (p[0] > 260 ? { x: p[0] - 6, anchor: 'end' as const } : { x: p[0] + 6, anchor: 'start' as const })
  const mid = pin && home ? [(pin[0] + home[0]) / 2, Math.min(pin[1], home[1]) - Math.min(40, Math.hypot(home[0] - pin[0], home[1] - pin[1]) * 0.3) / 2 - 3] : null

  return (
    <figure className="om">
      <svg className="om-map" viewBox={WORLD_VIEWBOX} role="img" aria-label={alt}>
        <title>{alt}</title>
        <rect width="360" height="180" className="om-sea" />
        {ORDER.map((c) => (
          <path key={c} d={CONTINENT_PATHS[c]} className={continents.includes(c) ? 'om-land on' : 'om-land'} />
        ))}
        {pin && home && <path d={arcPath(pin, home)} className="om-arc" />}
        {pin && <circle cx={pin[0]} cy={pin[1]} r="3.6" className="om-pin" />}
        {home && <circle cx={home[0]} cy={home[1]} r="3.6" className="om-home" />}
        {home && parkName && (
          <text x={labelSide(home).x} y={home[1] - 6} textAnchor={labelSide(home).anchor} className="om-lbl">
            {parkName}
          </text>
        )}
        {mid && kmLabel && (
          <text x={mid[0]} y={mid[1]} textAnchor="middle" className="om-lbl om-km">
            {kmLabel}
          </text>
        )}
      </svg>
      <figcaption className="om-cap">
        {facts?.range ? (lang === 'en' ? (facts.range.en ?? facts.range.nl) : facts.range.nl) : where ? `${tx.livesIn} ${where}.` : ''} {tx.schematic}
      </figcaption>
    </figure>
  )
}
