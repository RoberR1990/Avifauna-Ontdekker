import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useBundle } from '../../data/ParkDataProvider'
import type { BundleRoute, ParkBundle } from '../../data/types'
import { useSettings } from '../../state/settings'
import type { PlaceFeature } from '../../park/types'
import {
  clampView,
  featureCentroid,
  featurePath,
  fitView,
  locateInPark,
  viewForPlace,
  viewForPoints,
  viewHeight,
  zoomAt,
  type Pt,
  type Size,
  type View,
} from './geometry'
import { FACILITY_ORDER, FacilityBadge, FacilityGlyph, isFacilityType } from './icons'
import { parsePoints, RouteLayer } from './RouteLayer'
import { routeOpen } from '../routes/track-stubs'
import { useT } from './strings'
import { gpsToggle, mapOpen } from './track-stubs'
import { useGeolocation, type GeoStatus } from './useGeolocation'
import './map.css'

const ZONE_COLORS = ['var(--sun)', 'var(--teal)', 'var(--violet)', 'var(--pink)', 'var(--red)']
const DRAG_THRESHOLD_PX = 6

export function ParkMapPage() {
  const bundle = useBundle()
  const [params] = useSearchParams()
  const plek = params.get('plek')
  const routeId = params.get('route')
  const route = routeId ? ((bundle.routes ?? []).find((r) => r.id === routeId) ?? null) : null
  if (!bundle.map) return <NoMap />
  return <MapView key={`${plek ?? ''}|${route?.id ?? ''}`} bundle={bundle} map={bundle.map} plek={plek} route={route} />
}

function NoMap() {
  const t = useT()
  return (
    <>
      <h1>{t('title')}</h1>
      <p className="note">-</p>
    </>
  )
}

function placeName(p: PlaceFeature, lang: 'nl' | 'en'): string {
  return (lang === 'en' && p.properties.name_en) || p.properties.name_nl
}

/** Zonenaam voor op de kaart: zonder "(concept)" en zonder toelichting na de dubbele punt. */
function shortZoneName(name: string): string {
  return name.replace(/\s*\(concept\)\s*/i, '').split(':')[0]!.trim()
}

function MapView({
  bundle,
  map,
  plek,
  route,
}: {
  bundle: ParkBundle
  map: NonNullable<ParkBundle['map']>
  plek: string | null
  route: BundleRoute | null
}) {
  const t = useT()
  const { lang } = useSettings()
  const affine = map.georef.affine
  const mapSize: Size = useMemo(() => ({ w: map.georef.svg.width, h: map.georef.svg.height }), [map.georef])
  const features = bundle.places.features
  const zones = features.filter((f) => f.properties.kind === 'zone')
  const enclosures = features.filter((f) => f.properties.kind === 'enclosure')
  const facilities = features.filter((f) => f.properties.kind === 'facility' && isFacilityType(f.properties.facility_type))
  const plekFeature = plek ? features.find((f) => f.properties.id === plek) : undefined

  const holder = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ w: 375, h: 520 })
  const [view, setView] = useState<View | null>(null)
  const [selected, setSelected] = useState<string | null>(plekFeature ? plek : null)
  const [showZones, setShowZones] = useState(true)
  const [geoOn, setGeoOn] = useState(false)

  const routePts = useMemo(() => (route ? parsePoints(route.svg_points) : []), [route])
  const routeStops = useMemo(
    () =>
      route
        ? route.stops.map((st) => {
            const f = features.find((x) => x.properties.id === st.place_id)
            return f ? featureCentroid(f, affine) : null
          })
        : [],
    [route, features, affine],
  )

  const effective: View = useMemo(
    () =>
      clampView(
        view ??
          (plekFeature
            ? viewForPlace(plekFeature, affine, mapSize, size)
            : routePts.length > 0
              ? viewForPoints(routePts, mapSize, size)
              : fitView(mapSize, size)),
        mapSize,
        size,
      ),
    [view, plekFeature, routePts, affine, mapSize, size],
  )
  const vh = viewHeight(effective, size)
  const s = effective.w / size.w // SVG-eenheden per scherm-pixel

  useEffect(() => {
    mapOpen()
  }, [])
  const routeIdOpen = route?.id
  useEffect(() => {
    if (routeIdOpen) routeOpen(routeIdOpen)
  }, [routeIdOpen])

  useEffect(() => {
    const el = holder.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect
      if (r && r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- gebaren ----
  const live = useRef({ effective, size, s })
  useEffect(() => {
    live.current = { effective, size, s }
  })
  const pointers = useRef(new Map<number, Pt>())
  const gesture = useRef<{ view: View; start: Pt[]; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  function localPoint(e: { clientX: number; clientY: number }): Pt {
    const r = holder.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function startGesture() {
    gesture.current = { view: live.current.effective, start: [...pointers.current.values()], moved: gesture.current?.moved ?? false }
  }
  function onPointerDown(e: RPointerEvent) {
    if (pointers.current.size === 0) suppressClick.current = false
    pointers.current.set(e.pointerId, localPoint(e))
    gesture.current = null
    startGesture()
  }
  function onPointerMove(e: RPointerEvent) {
    const g = gesture.current
    if (!g || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, localPoint(e))
    const now = [...pointers.current.values()]
    const sz = live.current.size
    const s0 = g.view.w / sz.w
    if (now.length >= 2 && g.start.length >= 2) {
      const [a0, b0] = g.start as [Pt, Pt]
      const [a1, b1] = now as [Pt, Pt]
      const factor = Math.hypot(b1.x - a1.x, b1.y - a1.y) / Math.max(1, Math.hypot(b0.x - a0.x, b0.y - a0.y))
      const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }
      const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
      const w = g.view.w / factor
      const ratio = w / sz.w
      const p0 = { x: g.view.cx + (m0.x - sz.w / 2) * s0, y: g.view.cy + (m0.y - sz.h / 2) * s0 }
      suppressClick.current = true
      setView(clampView({ w, cx: p0.x - (m1.x - sz.w / 2) * ratio, cy: p0.y - (m1.y - sz.h / 2) * ratio }, mapSize, sz))
    } else if (now.length === 1 && g.start.length === 1) {
      const dx = now[0]!.x - g.start[0]!.x
      const dy = now[0]!.y - g.start[0]!.y
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      if (!g.moved) {
        g.moved = true
        suppressClick.current = true
        try {
          ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        } catch {
          /* niet kritiek */
        }
      }
      setView(clampView({ w: g.view.w, cx: g.view.cx - dx * s0, cy: g.view.cy - dy * s0 }, mapSize, sz))
    }
  }
  function onPointerEnd(e: RPointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) gesture.current = null
    else startGesture()
  }
  function onClickCapture(e: React.MouseEvent) {
    if (suppressClick.current) {
      e.stopPropagation()
      e.preventDefault()
      suppressClick.current = false
    }
  }

  // Scrollwiel (muis): zoomen zonder de pagina te laten scrollen.
  useEffect(() => {
    const el = holder.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { effective: v, size: sz } = live.current
      const r = el.getBoundingClientRect()
      const sc = v.w / sz.w
      const at = { x: v.cx + (e.clientX - r.left - sz.w / 2) * sc, y: v.cy + (e.clientY - r.top - sz.h / 2) * sc }
      setView(zoomAt(v, e.deltaY < 0 ? 1.25 : 0.8, at, mapSize, sz))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [mapSize])

  const zoomBy = (factor: number) => setView(zoomAt(effective, factor, { x: effective.cx, y: effective.cy }, mapSize, size))

  // ---- GPS (alleen in deze component, nooit opgeslagen) ----
  const { status, fix } = useGeolocation(geoOn)
  const center = bundle.park.center ?? null
  const located = fix ? locateInPark(affine, mapSize, center, fix) : null
  const youOutside = status === 'active' && located !== null && !located.inside
  const you = located && located.inside ? located : null
  const centeredOnce = useRef(false)
  useEffect(() => {
    if (!geoOn) centeredOnce.current = false
  }, [geoOn])
  const youX = you?.x
  const youY = you?.y
  useEffect(() => {
    if (youX === undefined || youY === undefined || centeredOnce.current) return
    centeredOnce.current = true
    const v = live.current.effective
    setView(clampView({ w: Math.min(v.w, mapSize.w / 2), cx: youX, cy: youY }, mapSize, live.current.size))
  }, [youX, youY, mapSize])

  function toggleGps() {
    const next = !geoOn
    setGeoOn(next)
    gpsToggle(next)
  }

  // ---- selectie ----
  const selectedFeature = selected ? features.find((f) => f.properties.id === selected) : undefined
  const isConcept = zones.some((z) => z.properties.source === 'manual' && /\(concept\)/i.test(z.properties.name_nl))
  const presentTypes = FACILITY_ORDER.filter((ft) => facilities.some((f) => f.properties.facility_type === ft))

  return (
    <div className="pm">
      <h1>{t('title')}</h1>
      {isConcept && (
        <p className="pm-concept" role="note">
          {t('concept')}
        </p>
      )}

      {route && (
        <div className="pm-routebar" data-testid="route-banner">
          <span>
            {t('route_label')}: {route.title}
          </span>
          <Link to="/kaart">{t('route_close')}</Link>
        </div>
      )}

      <div
        className="pm-holder"
        ref={holder}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
      >
        <svg
          className="pm-svg"
          viewBox={`${effective.cx - effective.w / 2} ${effective.cy - vh / 2} ${effective.w} ${vh}`}
          role="group"
          aria-label={t('map_label')}
          data-testid="park-map"
          data-selected={selected ?? undefined}
        >
          <image href={map.url} x="0" y="0" width={mapSize.w} height={mapSize.h} data-testid="map-base" />

          {showZones && (
            <g className="pm-zones">
              {zones.map((z, i) => {
                const id = z.properties.id
                return (
                  <path
                    key={id}
                    d={featurePath(z, affine)}
                    fill={ZONE_COLORS[i % ZONE_COLORS.length]}
                    className={`pm-zone${selected === id ? ' sel' : ''}${z.properties.indoor ? ' indoor' : ''}`}
                    data-place={id}
                    strokeWidth={(selected === id ? 3 : 1.5) * s}
                    onClick={() => setSelected(id)}
                  >
                    <title>{placeName(z, lang)}</title>
                  </path>
                )
              })}
              {effective.w < mapSize.w * 0.6 &&
                zones.map((z) => {
                const c = featureCentroid(z, affine)
                return (
                  <text
                    key={z.properties.id}
                    className="pm-zone-label"
                    x={c.x}
                    y={c.y}
                    fontSize={11 * s}
                    strokeWidth={3 * s}
                    textAnchor="middle"
                  >
                    {shortZoneName(placeName(z, lang))}
                  </text>
                )
              })}
            </g>
          )}

          <g className="pm-enclosures">
            {enclosures.map((f) => {
              const c = featureCentroid(f, affine)
              const id = f.properties.id
              return (
                <g
                  key={id}
                  transform={`translate(${c.x} ${c.y}) scale(${s})`}
                  className={`pm-enc${selected === id ? ' sel' : ''}`}
                  data-place={id}
                  role="button"
                  tabIndex={0}
                  aria-label={placeName(f, lang)}
                  onClick={() => setSelected(id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(id)}
                >
                  <circle r="18" fill="transparent" />
                  {selected === id && <circle r="13" className="pm-ring" />}
                  <circle r="6.5" className="pm-dot" />
                </g>
              )
            })}
          </g>

          <g className="pm-facilities">
            {facilities.map((f) => {
              const c = featureCentroid(f, affine)
              const id = f.properties.id
              const ft = f.properties.facility_type!
              return (
                <g
                  key={id}
                  transform={`translate(${c.x} ${c.y}) scale(${s * 1.25})`}
                  className={`pm-fac${selected === id ? ' sel' : ''}`}
                  data-place={id}
                  role="button"
                  tabIndex={0}
                  aria-label={placeName(f, lang)}
                  onClick={() => setSelected(id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(id)}
                >
                  <circle r="17" fill="transparent" />
                  {selected === id && <circle r="16" className="pm-ring" />}
                  <FacilityBadge type={ft} />
                </g>
              )
            })}
          </g>

          {route && <RouteLayer route={route} stops={routeStops} s={s} />}

          {you && (
            <g className="pm-you" data-testid="gps-dot" transform={`translate(${you.x} ${you.y})`}>
              {you.radius > 0 && <circle r={you.radius} className="pm-acc" data-testid="gps-accuracy" />}
              <circle r={8 * s} className="pm-you-dot" strokeWidth={3 * s}>
                <title>{t('you')}</title>
              </circle>
            </g>
          )}
        </svg>

        <div className="pm-zoom" role="group">
          <button type="button" className="pm-zbtn" aria-label={t('zoom_in')} onClick={() => zoomBy(1.6)}>
            +
          </button>
          <button type="button" className="pm-zbtn" aria-label={t('zoom_out')} onClick={() => zoomBy(1 / 1.6)}>
            &minus;
          </button>
          <button type="button" className="pm-zbtn pm-zreset" aria-label={t('reset')} onClick={() => setView(fitView(mapSize, size))}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="pm-gps">
        <button type="button" className={`btn${geoOn ? ' on' : ''}`} aria-pressed={geoOn} onClick={toggleGps}>
          {geoOn ? t('where_off') : t('where')}
        </button>
        <label className="pm-check">
          <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} /> {t('zones')}
        </label>
      </div>
      <p className="pm-private">{t('private')}</p>
      <GeoMessage status={status} outside={youOutside} />

      {selectedFeature && <PlacePanel place={selectedFeature} bundle={bundle} lang={lang} onClose={() => setSelected(null)} />}

      <section className="pm-legend" aria-label={t('legend')}>
        <h2>{t('legend')}</h2>
        <ul>
          <li>
            <span className="pm-sw pm-sw-zone" aria-hidden="true" /> {t('zone')}
          </li>
          <li>
            <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
              <circle r="6.5" className="pm-dot" />
            </svg>{' '}
            {t('enclosure')}
          </li>
          {presentTypes.map((ft) => (
            <li key={ft}>
              <svg width="24" height="24" viewBox="-13 -13 26 26" aria-hidden="true">
                <FacilityBadge type={ft} />
              </svg>{' '}
              {t(`ft_${ft}` as 'ft_toilet')}
            </li>
          ))}
          <li>
            <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
              <circle r="7" className="pm-you-dot" strokeWidth="3" />
            </svg>{' '}
            {t('you')}
          </li>
        </ul>
      </section>
    </div>
  )
}

function GeoMessage({ status, outside }: { status: GeoStatus; outside: boolean }) {
  const t = useT()
  let text: string | null = null
  if (status === 'searching') text = t('searching')
  else if (outside) text = t('outside')
  else if (status === 'denied') text = t('denied')
  else if (status === 'unavailable') text = t('unavailable')
  else if (status === 'error') text = t('error')
  return (
    <p className="pm-geo" role="status" aria-live="polite" data-testid="gps-message">
      {text}
    </p>
  )
}

function PlacePanel({ place, bundle, lang, onClose }: { place: PlaceFeature; bundle: ParkBundle; lang: 'nl' | 'en'; onClose: () => void }) {
  const t = useT()
  const p = place.properties
  const species = useMemo(() => {
    if (p.kind === 'enclosure') return bundle.species.filter((sp) => sp.place_id === p.id)
    if (p.kind !== 'zone') return []
    const inZone = new Set(
      bundle.places.features.filter((f) => f.properties.kind === 'enclosure' && f.properties.zone_id === p.id).map((f) => f.properties.id),
    )
    return bundle.species.filter((sp) => sp.zone_id === p.id || (sp.place_id !== null && inZone.has(sp.place_id)))
  }, [bundle, p.id, p.kind])
  const label =
    p.kind === 'zone'
      ? t('zone')
      : p.kind === 'enclosure'
        ? t('enclosure')
        : isFacilityType(p.facility_type)
          ? t(`ft_${p.facility_type}` as 'ft_toilet')
          : ''
  const name = p.kind === 'zone' ? placeName(place, lang).replace(/\s*\(concept\)\s*/i, '') : placeName(place, lang)
  const hasList = p.kind === 'zone' || p.kind === 'enclosure'
  return (
    <section className="pm-panel card" aria-live="polite" data-testid="place-panel" data-place={p.id}>
      <button type="button" className="pm-close" aria-label={t('close')} onClick={onClose}>
        &times;
      </button>
      <p className="pm-kind">
        {isFacilityType(p.facility_type) && <FacilityGlyph type={p.facility_type} size={18} />} {label}
      </p>
      <h2>{name}</h2>
      {hasList &&
        (species.length > 0 ? (
          <>
            <p className="pm-sub">{t('species_here')}</p>
            <ul className="pm-species">
              {species.map((sp) => (
                <li key={sp.slug}>
                  <Link to={`/soort/${sp.slug}`}>{sp.name}</Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="note">{t('none_here')}</p>
        ))}
    </section>
  )
}
