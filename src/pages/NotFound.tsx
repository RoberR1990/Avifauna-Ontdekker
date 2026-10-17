import { Link } from 'react-router-dom'
import { defaultLang } from '../park'
import { t } from '../i18n'

export function NotFound() {
  return (
    <>
      <h1>{t('notfound.title', defaultLang)}</h1>
      <Link className="button" to="/">
        {t('notfound.back', defaultLang)}
      </Link>
    </>
  )
}
