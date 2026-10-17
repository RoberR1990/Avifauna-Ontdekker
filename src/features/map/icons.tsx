import type { FacilityType } from '../../park/types'

// Eigen pictogrammen op een raster van 24x24 (geen externe bronnen).
const P: Record<FacilityType, string> = {
  toilet:
    'M8 3a1.6 1.6 0 1 1 0 3.2A1.6 1.6 0 0 1 8 3zM5.5 8h5l1 7h-1.6V21H7V15H5.5zM16 3a1.6 1.6 0 1 1 0 3.2A1.6 1.6 0 0 1 16 3zM14 8h4l2 7h-1.8l-.7-2.2V21h-2.3v-8.2L14.5 15H13z',
  baby_change: 'M4 17h16v2H4zM6 9h12l1 6H5zM9 5a3 3 0 1 1 6 0v2H9z',
  food: 'M7 3v7a2 2 0 0 0 1.5 1.9V21h2V11.9A2 2 0 0 0 12 10V3h-1.4v5.5H9.8V3H8.4v5.5H7.4V3zM17 3c-1.9 1.4-3 4-3 6.5 0 1.5.8 2.5 2 2.5V21h2z',
  water: 'M12 3c3 4.2 5.5 7 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 10 9 7.2 12 3z',
  playground: 'M4 21 10 5h2.5L19 21h-2.2l-1.3-3.4H8.5L7.2 21zM9.2 15.8h5.6L12 8.5zM3 21h18v1.5H3z',
  picnic: 'M3 9h18v2H3zM6 11l-2 9h2l1.2-5.5h9.6L18 20h2l-2-9zM8 6h8v2H8z',
  show: 'M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.100 18.200l.9-5.5-4-3.9 5.6-.8z',
  feeding: 'M5 11a7 7 0 0 1 14 0v2H5zM4 14h16l-1.5 6h-13zM11 4h2v2h-2z',
  entrance: 'M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8v-2h8V6h-8zM4 11h7V7.5L16.5 12 11 16.5V13H4z',
  exit: 'M6 4h8v2H6v12h8v2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM13 8l5 4-5 4v-3H8v-2h5z',
  first_aid: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  info: 'M11 10h2v8h-2zM11 6h2v2h-2zM12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  shelter: 'M12 3 2 11h2.5v9h15v-9H22zM10 20v-5h4v5z',
}

export const FACILITY_COLORS: Record<FacilityType, string> = {
  toilet: 'var(--teal)',
  baby_change: 'var(--teal)',
  food: 'var(--red)',
  water: 'var(--teal)',
  playground: 'var(--violet)',
  picnic: 'var(--red)',
  show: 'var(--violet)',
  feeding: 'var(--sun)',
  entrance: 'var(--ink)',
  exit: 'var(--ink)',
  first_aid: 'var(--red)',
  info: 'var(--teal)',
  shelter: 'var(--violet)',
}

export const FACILITY_ORDER = Object.keys(P) as FacilityType[]

export function isFacilityType(v: string | undefined): v is FacilityType {
  return !!v && v in P
}

/** Los pictogram (24x24) in de huidige tekstkleur. */
export function FacilityGlyph({ type, size = 20 }: { type: FacilityType; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill="currentColor">
      <path d={P[type]} />
    </svg>
  )
}

/** Pictogram binnen de SVG-kaart: gekleurde cirkel met pictogram, gecentreerd op (0,0), straal 12. */
export function FacilityBadge({ type }: { type: FacilityType }) {
  return (
    <g>
      <circle r="12" fill={FACILITY_COLORS[type]} stroke="var(--ink)" strokeWidth="1.5" />
      <path d={P[type]} transform="translate(-8 -8) scale(0.667)" fill={type === 'feeding' ? 'var(--ink)' : '#fff'} />
    </g>
  )
}
