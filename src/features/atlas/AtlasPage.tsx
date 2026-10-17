import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { mediaUrl, useBundle } from '../../data/ParkDataProvider'
import type { BundleSpecies } from '../../data/types'
import { useSettings } from '../../state/settings'
import {
  activeFilterCount,
  applyFilters,
  availableOptions,
  emptyFilters,
  hasFilters,
  parseFilters,
  serializeFilters,
  toggleValue,
  trackFilter,
  type AtlasFilters,
  type FacetName,
} from './filter'
import { useAtlasT } from './i18n'
import './atlas.css'

/** Vaste breedte/hoogte van de thumb (4:3), tegen layout shift. */
const THUMB_W = 400
const THUMB_H = 300
const EAGER = 6

const COLOR_HEX: Record<string, string> = {
  black: '#231942',
  white: '#fffdf7',
  grey: '#9a96a6',
  brown: '#8a5a33',
  red: '#e8452f',
  orange: '#f28a2e',
  yellow: '#ffc233',
  green: '#3aa655',
  blue: '#2f7de1',
  purple: '#6a48d7',
  pink: '#ff8fa3',
}

function SpeciesCard({ s, eager }: { s: BundleSpecies; eager: boolean }) {
  const t = useAtlasT()
  return (
    <li>
      <Link className="atlas-card" to={`/soort/${s.slug}`}>
        <span className="atlas-thumb">
          {s.photo ? (
            <img
              src={mediaUrl(s.photo.thumb_url)}
              alt=""
              width={THUMB_W}
              height={THUMB_H}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
            />
          ) : (
            <span className="atlas-nophoto" aria-hidden="true">
              ðŸ¦
            </span>
          )}
          {s.iucn && (
            <span className="badge atlas-iucn" data-iucn={s.iucn} aria-label={`${t('iucnAria')} ${s.iucn}`}>
              <b>{s.iucn}</b>
            </span>
          )}
        </span>
        <span className="atlas-name">{s.name}</span>
        <i className="atlas-latin">{s.scientific_name}</i>
      </Link>
    </li>
  )
}

export function AtlasPage() {
  const bundle = useBundle()
  const { lang } = useSettings()
  const t = useAtlasT()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(() => activeFilterCount({ ...parseFilters(params), q: '' }) > 0)

  const options = useMemo(() => availableOptions(bundle.species), [bundle.species])
  const filters = useMemo(() => parseFilters(params, options), [params, options])

  const zoneNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of bundle.places.features) {
      const p = f.properties
      if (p.kind === 'zone') m.set(p.id, (lang === 'en' && p.name_en) || p.name_nl)
    }
    return m
  }, [bundle.places, lang])

  const results = useMemo(() => applyFilters(bundle.species, filters), [bundle.species, filters])

  const update = useCallback(
    (next: AtlasFilters, replace: boolean) => {
      setParams((prev) => serializeFilters(next, prev), { replace })
    },
    [setParams],
  )

  const toggle = <K extends Exclude<FacetName, never>>(facet: K, value: AtlasFilters[K][number]) => {
    const next = { ...filters, [facet]: toggleValue(filters[facet] as string[], value as string) } as AtlasFilters
    trackFilter(facet)
    update(next, false)
  }

  const groups: { facet: FacetName; label: string; values: string[]; text: (v: string) => string; color?: boolean }[] = [
    { facet: 'continents', label: t('continents'), values: options.continents, text: (v) => t(`continent.${v}` as never) },
    { facet: 'colors', label: t('colors'), values: options.colors, text: (v) => t(`color.${v}` as never), color: true },
    { facet: 'sizes', label: t('sizes'), values: options.sizes, text: (v) => t(`size.${v}` as never) },
    { facet: 'zones', label: t('zones'), values: options.zones, text: (v) => zoneNames.get(v) ?? v },
    { facet: 'iucn', label: t('iucn'), values: options.iucn, text: (v) => t(`iucn.${v}` as never) },
  ]

  const count = results.length === 1 ? t('countOne') : t('countMany').replace('{n}', String(results.length))
  const active = hasFilters(filters)
  const facetCount = activeFilterCount({ ...filters, q: '' })

  return (
    <div className="atlas">
      <h1>{t('title')}</h1>

      <input
        className="input atlas-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        aria-label={t('searchLabel')}
        placeholder={t('search')}
        value={filters.q}
        onChange={(e) => update({ ...filters, q: e.target.value }, true)}
      />

      <button
        type="button"
        className="btn btn--ghost btn--small atlas-toggle"
        aria-expanded={open}
        aria-controls="atlas-filters"
        onClick={() => setOpen((o) => !o)}
      >
        {t('filters')}
        {facetCount > 0 ? ` (${facetCount})` : ''} {open ? '▲' : '▼'}
      </button>

      <div id="atlas-filters" className="atlas-filters" role="group" aria-label={t('filters')} hidden={!open}>
        {groups
          .filter((g) => g.values.length > 0)
          .map((g) => (
            <fieldset key={g.facet} className="atlas-group">
              <legend>{g.label}</legend>
              <div className="atlas-chips">
                {g.values.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="chip"
                    aria-pressed={(filters[g.facet] as string[]).includes(v)}
                    onClick={() => toggle(g.facet, v as never)}
                  >
                    {g.color && <span className="atlas-dot" style={{ background: COLOR_HEX[v] }} aria-hidden="true" />}
                    {g.text(v)}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
      </div>

      <div className="atlas-bar">
        <p className="atlas-count" role="status" aria-live="polite">
          {count}
        </p>
        {active && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => update(emptyFilters, false)}>
            {t('clear')}
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="card atlas-empty" data-testid="atlas-empty">
          <h2>{t('emptyTitle')}</h2>
          <p>{bundle.species.length === 0 ? t('emptyNone') : t('emptyText')}</p>
        </div>
      ) : (
        <ul className="atlas-grid">
          {results.map((s, i) => (
            <SpeciesCard key={s.slug} s={s} eager={i < EAGER} />
          ))}
        </ul>
      )}
    </div>
  )
}
