import { defaultLang, park } from '../park'
import { localized, t } from '../i18n'

export function About() {
  const lang = defaultLang
  const { about, links } = park
  return (
    <>
      <h1>{t('about.title', lang)}</h1>
      <p>{localized(about, lang)}</p>
      <p>
        <a className="button" href={about.source_code_url} rel="noopener noreferrer">
          {t('about.source', lang)}
        </a>
        {about.personal_site_url && (
          <a className="button secondary" href={about.personal_site_url} rel="noopener noreferrer">
            {about.builder}
          </a>
        )}
      </p>

      <h2>{t('about.official.title', lang)}</h2>
      <p>{t('about.official.text', lang)}</p>
      <p>
        <a className="button secondary" href={links.official_site} rel="noopener noreferrer">
          {t('about.official.link', lang)}
        </a>
      </p>

      <h2>{t('about.privacy.title', lang)}</h2>
      <p>{t('about.privacy.text', lang)}</p>

      <h2>{t('about.data.title', lang)}</h2>
      <p>{t('about.data.text', lang)}</p>
    </>
  )
}
