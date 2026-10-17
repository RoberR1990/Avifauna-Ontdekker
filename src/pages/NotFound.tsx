import { Link } from 'react-router-dom'
import { useT } from '../i18n'

export function NotFound() {
  const t = useT()
  return (
    <>
      <h1>{t('notfound.title')}</h1>
      <Link className="btn" to="/">
        {t('notfound.back')}
      </Link>
    </>
  )
}
