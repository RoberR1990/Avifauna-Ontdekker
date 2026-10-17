import { Link } from 'react-router-dom'
import { defaultLang, park } from '../park'
import { t } from '../i18n'

export function Home() {
  return (
    <>
      <h1>{park.app_name}</h1>
      <p className="lead">{t('home.soon', defaultLang)}</p>
      <Link className="button" to="/over">
        {t('home.about_link', defaultLang)}
      </Link>
    </>
  )
}
