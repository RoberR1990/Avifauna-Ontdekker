import { Link } from 'react-router-dom'
import { useParkData } from '../data/ParkDataProvider'
import { localized, useT } from '../i18n'
import { OfflineDownloadButton } from '../offline/OfflineDownloadButton'
import { park } from '../park'
import { useSettings } from '../state/settings'

export function About() {
  const t = useT()
  const { lang } = useSettings()
  const { bundle } = useParkData()
  const { about, links } = park
  return (
    <>
      <h1>{t('about.title')}</h1>
      <p>{localized(about, lang)}</p>
      <p className="btn-row">
        {about.source_code_url && (
          <a className="btn" href={about.source_code_url} rel="noopener noreferrer">
            {t('about.source')}
          </a>
        )}
        {about.personal_site_url && (
          <a className="btn btn--ghost" href={about.personal_site_url} rel="noopener noreferrer">
            {about.builder}
          </a>
        )}
      </p>

      <section className="card c-v">
        <h2>{t('about.official.title')}</h2>
        <p>{t('about.official.text')}</p>
        <a className="btn btn--ghost" href={links.official_site} rel="noopener noreferrer">
          {t('about.official.link')}
        </a>
      </section>

      <section className="card c-t">
        <h2>{t('about.offline.title')}</h2>
        <p>{t('about.offline.text')}</p>
        {bundle && <OfflineDownloadButton />}
      </section>

      <section className="card c-r">
        <h2>{t('about.privacy.title')}</h2>
        <p>{t('about.privacy.text')}</p>
      </section>

      <section className="card c-s">
        <h2>{t('about.data.title')}</h2>
        <p>{t('about.data.text')}</p>
        <Link className="btn btn--ghost" to="/bronnen">
          {t('nav.sources')}
        </Link>
      </section>
    </>
  )
}
