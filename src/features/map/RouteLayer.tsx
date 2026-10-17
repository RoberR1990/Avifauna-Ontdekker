import type { BundleRoute } from '../../data/types'
import type { Pt } from './geometry'

/** Punten uit een "x,y x,y"-string. */
export function parsePoints(s: string): Pt[] {
  return s
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([x, y]) => ({ x: x!, y: y! }))
}

/** Routelijn (inktrand + kleurlijn) en genummerde stops. `stops` heeft kaartcoördinaten per route-stop. */
export function RouteLayer({ route, stops, s }: { route: BundleRoute; stops: (Pt | null)[]; s: number }) {
  return (
    <g className="pm-route" data-testid="route-layer" data-route={route.id}>
      <polyline points={route.svg_points} className="pm-route-ink" vectorEffect="non-scaling-stroke" data-testid="route-line" />
      <polyline points={route.svg_points} className="pm-route-line" vectorEffect="non-scaling-stroke" />
      {stops.map((c, i) =>
        c ? (
          <g key={`${route.id}-${i}`} transform={`translate(${c.x} ${c.y}) scale(${s})`} className="pm-rstop" data-testid="route-stop">
            <circle r="11" className="pm-rstop-dot" />
            <text className="pm-rstop-num" textAnchor="middle" dy="0.35em">
              {i + 1}
            </text>
          </g>
        ) : null,
      )}
    </g>
  )
}
