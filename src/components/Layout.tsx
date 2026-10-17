import { NavLink, Outlet } from 'react-router-dom'
import { defaultLang, park } from '../park'
import { localized, t } from '../i18n'

export function Layout() {
  const lang = defaultLang
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t('skip.main', lang)}
      </a>
      <div className="disclaimer-bar" role="note" data-testid="disclaimer-bar">
        {localized(park.disclaimer_bar, lang)}
      </div>
      <header className="site-header">
        <span className="app-name">{park.app_name}</span>
        <nav aria-label={t('nav.main', lang)}>
          <NavLink to="/" end>
            {t('nav.home', lang)}
          </NavLink>
          <NavLink to="/over">{t('nav.about', lang)}</NavLink>
        </nav>
      </header>
      <main id="main" className="content">
        <Outlet />
      </main>
      <footer className="site-footer" data-testid="site-footer">
        {localized(park.footer, lang)}
      </footer>
    </div>
  )
}
