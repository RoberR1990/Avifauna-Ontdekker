import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { mediaUrl, useBundle, useSpecies } from '../../data/ParkDataProvider'
import type { BundleSpecies, Lang, Level, ParkBundle } from '../../data/types'
import { useT } from '../../i18n'
import { stop } from '../../lib/speech'
import { useSettings } from '../../state/settings'
import { BirdOMeter } from '../meter/BirdOMeter'
import { OriginMap } from '../origin/OriginMap'
import { days, mass, paragraphs, range, TREND_KEYS, years } from './format'
import { useSpeciesT } from './i18n'
import { AttributionLine, ReadAloudButton, SoundPlayer } from './parts'
import { levelChange, speciesView } from './track-stubs'
import './species.css'

const LEVELS: Level[] = ['kind', 'b1', 'kenner']

type SpT = ReturnType<typeof useSpeciesT>
type Row = [label: string, value: string]

function l10n(v: { nl: string; en?: string | null } | null | undefined, lang: Lang): string | null {
  if (!v) return null
  return (lang === 'en' ? v.en : null) ?? v.nl
}

/** park.center, anders het zwaartepunt van alle zone- en verblijfpunten. */
function parkCenterOf(bundle: ParkBundle): { lat: number; lon: number } | null {
  if (bundle.park.center) return bundle.park.center
  const pts: [number, number][] = []
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number') pts.push([c[0], c[1]])
    else c.forEach(walk)
  }
  bundle.places.features.filter((f) => f.properties.kind === 'zone').forEach((f) => walk(f.geometry?.coordinates))
  if (!pts.length) return null
  return { lon: pts.reduce((s, p) => s + p[0], 0) / pts.length, lat: pts.reduce((s, p) => s + p[1], 0) / pts.length }
}

function iucnLabel(sp: BundleSpecies, t: SpT) {
  return sp.iucn ? t(`iucn.${sp.iucn}`) : null
}

function iucnText(sp: BundleSpecies, t: SpT): string | null {
  const label = iucnLabel(sp, t)
  if (!label) return null
  const trend = sp.facts && sp.facts.iucn_trend !== 'unknown' ? t(TREND_KEYS[sp.facts.iucn_trend]) : null
  return `${sp.iucn} · ${label}${trend ? `, ${trend}` : ''}`
}

/** Feitenrijen; ontbrekende waarden vervallen. `full` = kenner (met orde, familie, IUCN). */
function factRows(sp: BundleSpecies, lang: Lang, t: SpT, full: boolean): Row[] {
  const f = sp.facts
  const rows: (Row | null)[] = []
  const add = (label: string, value: string | null | undefined) => rows.push(value ? [label, value] : null)
  if (full) {
    add(t('f.order'), sp.order)
    add(t('f.family'), sp.family)
    add(t('f.iucn'), iucnText(sp, t))
  }
  if (f) {
    add(t('f.range'), l10n(f.range, lang))
    add(t('f.length'), range(f.length_cm, 'cm', lang))
    add(t('f.height'), range(f.height_cm, 'cm', lang))
    add(t('f.mass'), mass(f.mass_g, lang))
    add(t('f.wingspan'), range(f.wingspan_cm, 'cm', lang))
    add(t('f.clutch'), l10n(f.clutch, lang))
    add(t('f.incubation'), days(f.incubation_days, lang))
    add(t('f.diet'), l10n(f.diet, lang))
    add(t('f.habitat'), l10n(f.habitat, lang))
    add(t('f.lifeWild'), years(f.lifespan_wild_y, lang))
    add(t('f.lifeCaptive'), years(f.lifespan_captivity_y, lang))
    add(t('f.threats'), l10n(f.threats, lang))
  }
  return rows.filter((r): r is Row => r !== null)
}

function FactList({ rows }: { rows: Row[] }) {
  if (!rows.length) return null
  return (
    <dl className="facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Paragraphs({ text, kid }: { text: string; kid?: boolean }) {
  return (
    <div className={kid ? 'kidtext' : 'readable'}>
      {paragraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  )
}

export function SpeciesPage() {
  const t = useT()
  const st = useSpeciesT()
  const { lang, level, set } = useSettings()
  const bundle = useBundle()
  const { slug } = useParams()
  const species = useSpecies(slug)

  useEffect(() => {
    if (slug) speciesView(slug)
    return () => stop()
  }, [slug])

  const parkCenter = useMemo(() => parkCenterOf(bundle), [bundle])

  if (!species)
    return (
      <div className="species-page">
        <p>{t('species.notfound')}</p>
        <Link className="btn" to="/atlas">
          {t('species.back')}
        </Link>
      </div>
    )

  const chooseLevel = (l: Level) => {
    if (l === level) return
    stop()
    set({ level: l })
    levelChange(l)
  }

  const sp = species
  const { text, facts } = sp
  const photoAttr = sp.photo ? bundle.attributions[sp.photo.attribution] : undefined
  const audioAttr = sp.audio ? bundle.attributions[sp.audio.attribution] : undefined
  const levelText = text?.[level] ?? null
  const hasAnyText = !!(text && (text.kind || text.b1 || text.kenner))
  const otherLang = text && text.lang !== lang
  const place = (sp.place_id ? bundle.places.features.find((f) => f.properties.id === sp.place_id) : undefined) ?? undefined
  const zone = sp.zone_id ? bundle.places.features.find((f) => f.properties.id === sp.zone_id) : undefined
  const placeNames = [place, zone && zone !== place ? zone : undefined]
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => (lang === 'en' ? p.properties.name_en : null) ?? p.properties.name_nl)
  const mapTarget = sp.place_id ?? sp.zone_id
  const programme = bundle.programme.items.filter((i) => i.species?.includes(sp.slug))
  const programmeUrl = bundle.park.links.programme ?? bundle.programme.source_url
  const iucnName = iucnLabel(sp, st)
  const trend = facts && facts.iucn_trend !== 'unknown' ? st(TREND_KEYS[facts.iucn_trend]) : null
  const wikiUrl = sp.links.wikipedia

  const textNotes = hasAnyText && (
    <>
      {otherLang && <p className="sp-note">{text.lang === 'nl' ? st('text.onlyNl') : st('text.onlyEn')}</p>}
      {text && !text.reviewed && <p className="sp-note sp-draft">{st('text.draft')}</p>}
    </>
  )

  const noTextFacts = !hasAnyText && (
    <section className="card c-s" aria-labelledby="sp-facts">
      <h2 id="sp-facts">{st('kenner.title')}</h2>
      <p className="sp-note">{st('text.none')}</p>
      <FactList rows={factRows(sp, lang, st, true)} />
    </section>
  )

  const soundCard = sp.audio && (sp.audio.opus_url || sp.audio.m4a_url) && (
    <section className="card c-v" aria-labelledby="sp-sound">
      <h2 id="sp-sound">{st('sound.title')}</h2>
      <SoundPlayer species={sp} />
      <AttributionLine attribution={audioAttr} kind="audio" />
    </section>
  )

  const parkLine = placeNames.length > 0 || programme.length > 0

  return (
    <div className="species-page" data-testid="species-page">
      <div className="levels" role="group" aria-label={st('level.label')}>
        {LEVELS.map((l) => (
          <button key={l} type="button" aria-pressed={level === l} onClick={() => chooseLevel(l)}>
            {st(`level.${l}`)}
          </button>
        ))}
      </div>

      <figure className="sp-hero">
        {sp.photo && (
          <img
            src={mediaUrl(sp.photo.url)}
            alt={sp.name}
            width={1200}
            height={900}
            fetchPriority="high"
            decoding="async"
          />
        )}
        {sp.photo && (
          <figcaption>
            <AttributionLine attribution={photoAttr} kind="photo" />
          </figcaption>
        )}
      </figure>

      <h1>{sp.name}</h1>
      <p className="latin">{sp.scientific_name}</p>
      {sp.iucn && (
        <p className="sp-iucn">
          <span className="badge" data-iucn={sp.iucn}>
            <b>{sp.iucn}</b> {iucnName}
            {trend && <span className="sp-trend"> · {trend}</span>}
          </span>
        </p>
      )}

      {level === 'kind' && (
        <>
          {levelText && (
            <section className="sp-block" aria-label={st('level.kind')}>
              <Paragraphs text={levelText} kid />
              {textNotes}
            </section>
          )}
          {facts?.wow && <p className="wow">{l10n(facts.wow, lang)}</p>}
          {levelText && <ReadAloudButton text={[levelText, l10n(facts?.wow, lang)].filter(Boolean).join(' ')} lang={text?.lang ?? lang} level={level} />}
          {!levelText && hasAnyText && textNotes}
          {noTextFacts}
          {soundCard}
        </>
      )}

      {level === 'b1' && (
        <>
          <BirdOMeter species={sp} lang={lang} card />
          {levelText && (
            <section className="sp-block">
              <Paragraphs text={levelText} />
              {textNotes}
              <ReadAloudButton text={levelText} lang={text?.lang ?? lang} level={level} />
            </section>
          )}
          {!levelText && hasAnyText && textNotes}
          {noTextFacts}

          <section className="card c-t" aria-labelledby="sp-home">
            <h2 id="sp-home">{st('home.title')}</h2>
            <OriginMap species={sp} lang={lang} parkCenter={parkCenter} parkName={bundle.park.park_name} />
          </section>

          {soundCard}

          {(parkLine || sp.last_seen) && (
            <section className="card c-s" aria-labelledby="sp-park">
              <h2 id="sp-park">{st('park.title')}</h2>
              {placeNames.length > 0 && (
                <p>
                  {st('park.where')}: <strong>{placeNames.join(' · ')}</strong>
                </p>
              )}
              {mapTarget && (
                <Link className="btn btn--ghost" to={`/kaart?plek=${encodeURIComponent(mapTarget)}`}>
                  {st('park.map')}
                </Link>
              )}
              {sp.last_seen && (
                <p className="sp-note">
                  {st('park.seen')}: {sp.last_seen}
                </p>
              )}
              {programme.length > 0 && (
                <div className="sp-programme">
                  <h3>{st('park.programme')}</h3>
                  <ul>
                    {programme.map((i, n) => (
                      <li key={n}>
                        <strong>{i.time}</strong> {l10n(i.title, lang)}
                        {i.note && <> – {l10n(i.note, lang)}</>}
                      </li>
                    ))}
                  </ul>
                  <p className="sp-note">
                    {st('park.check')}{' '}
                    <a href={programmeUrl} rel="noopener noreferrer">
                      {st('park.programmeLink')}
                    </a>
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="card c-r" aria-labelledby="sp-more">
            <h2 id="sp-more">{st('more.title')}</h2>
            <details>
              <summary>{st('kenner.title')}</summary>
              <FactList rows={factRows(sp, lang, st, true)} />
            </details>
            <ul className="links">
              {wikiUrl && (
                <li>
                  <a href={wikiUrl} rel="noopener noreferrer">
                    {st('link.wikipedia')}
                  </a>
                </li>
              )}
              {sp.links.park && (
                <li>
                  <a href={sp.links.park} rel="noopener noreferrer">
                    {st('more.park')}
                  </a>
                </li>
              )}
            </ul>
          </section>
        </>
      )}

      {level === 'kenner' && (
        <>
          <section className="card c-v" aria-labelledby="sp-facts">
            <h2 id="sp-facts">{st('kenner.title')}</h2>
            <FactList rows={factRows(sp, lang, st, true)} />
          </section>

          {hasAnyText && (
            <section className="card c-r" aria-labelledby="sp-notes">
              <h2 id="sp-notes">{st('kenner.text')}</h2>
              {levelText ? <Paragraphs text={levelText} /> : null}
              {textNotes}
            </section>
          )}
          {!hasAnyText && <p className="sp-note">{st('text.none')}</p>}

          {soundCard}

          <section className="card c-t" aria-labelledby="sp-links">
            <h2 id="sp-links">{st('kenner.links')}</h2>
            <ul className="links">
              {sp.links.xeno_canto && (
                <li>
                  <a href={sp.links.xeno_canto} rel="noopener noreferrer">
                    {st('link.xc')}
                  </a>
                </li>
              )}
              {wikiUrl && (
                <li>
                  <a href={wikiUrl} rel="noopener noreferrer">
                    {st('link.wikipedia')}
                  </a>
                </li>
              )}
              {sp.links.wikidata && (
                <li>
                  <a href={sp.links.wikidata} rel="noopener noreferrer">
                    {st('link.wikidata')}
                  </a>
                </li>
              )}
              {sp.links.park && (
                <li>
                  <a href={sp.links.park} rel="noopener noreferrer">
                    {st('link.park')}
                  </a>
                </li>
              )}
            </ul>
            <SourceList sp={sp} />
          </section>
        </>
      )}

      <p className="sp-all-sources">
        <Link to="/bronnen">{st('sources.all')}</Link>
      </p>
    </div>
  )
}

function SourceList({ sp }: { sp: BundleSpecies }) {
  const st = useSpeciesT()
  const seen = new Set<string>()
  const items = [...(sp.text?.sources ?? []), ...(sp.facts?.sources ?? [])].filter((s) => {
    if (seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
  if (!items.length) return null
  return (
    <div className="src">
      <strong>{st('kenner.sources')}</strong>
      <ul>
        {items.map((s) => (
          <li key={s.url}>
            <a href={s.url} rel="noopener noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
