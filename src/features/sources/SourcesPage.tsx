import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useBundle } from '../../data/ParkDataProvider'
import type { BundleAttribution } from '../../data/types'
import { useSettings } from '../../state/settings'
import { useSourcesT } from './i18n'
import './sources.css'

const KIND_KEY = { photo: 'photo', audio: 'audio', model: 'model' } as const

export function SourcesPage() {
  const t = useSourcesT()
  const { lang } = useSettings()
  const bundle = useBundle()

  const groups = useMemo(() => {
    const names = new Map(bundle.species.map((s) => [s.slug, s.name]))
    const bySlug = new Map<string, BundleAttribution[]>()
    for (const a of bundle.attributions) bySlug.set(a.slug, [...(bySlug.get(a.slug) ?? []), a])
    return [...bySlug.entries()]
      .map(([slug, items]) => ({ slug, name: names.get(slug) ?? slug, known: names.has(slug), items }))
      .sort((a, b) => a.name.localeCompare(b.name, lang))
  }, [bundle, lang])

  return (
    <div className="sources-page">
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>

      <section className="card c-t" aria-labelledby="src-lic">
        <h2 id="src-lic">{t('lic')}</h2>
        <ul>
          <li>{t('lic0')}</li>
          <li>{t('licBy')}</li>
          <li>{t('licSa')}</li>
          <li>{t('licNc')}</li>
        </ul>
        <Link className="btn btn--ghost" to="/over">
          {t('about')}
        </Link>
      </section>

      {groups.length === 0 && <p>{t('empty')}</p>}
      {groups.map((g) => (
        <section key={g.slug} className="card c-s" aria-labelledby={`src-${g.slug}`}>
          <h2 id={`src-${g.slug}`}>{g.name}</h2>
          {g.known && (
            <p>
              <Link to={`/soort/${g.slug}`}>{t('species')}</Link>
            </p>
          )}
          <ul className="src-list">
            {g.items.map((a, i) => (
              <li key={`${a.url}-${i}`}>
                <strong>{t(KIND_KEY[a.kind])}</strong>: {a.title}
                <dl className="src-meta">
                  <div>
                    <dt>{t('creator')}</dt>
                    <dd>{a.creator}</dd>
                  </div>
                  <div>
                    <dt>{t('license')}</dt>
                    <dd>
                      {a.license_url ? (
                        <a href={a.license_url} rel="noopener noreferrer">
                          {a.license}
                        </a>
                      ) : (
                        a.license
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('source')}</dt>
                    <dd>
                      <a href={a.source_url} rel="noopener noreferrer">
                        {a.source}
                      </a>
                    </dd>
                  </div>
                  {a.modified && (
                    <div>
                      <dt>{t('edited')}</dt>
                      <dd>{a.modified}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t('retrieved')}</dt>
                    <dd>{a.retrieved}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
