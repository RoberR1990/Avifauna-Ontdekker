import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ParkDataProvider } from '../data/ParkDataProvider'
import { localized, useT } from '../i18n'
import { park } from '../park'
import { useSettings } from '../state/settings'
import type { Lang } from '../data/types'

const LANGS: { code: Lang; label: string }[] = [
  { code: 'nl', label: 'NL' },
  { code: 'en', label: 'EN' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

export function Layout() {
  const t = useT()
  const settings = useSettings()
  const { lang, set } = settings
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const toddlerRoute = pathname === '/peuter'
  const languages = LANGS.filter((l) => (park.languages as string[]).includes(l.code))

  // Peuterstand volgt de route, zodat features hem kunnen lezen.
  useEffect(() => {
    set({ toddler: toddlerRoute })
  }, [toddlerRoute, set])

  return (
    <div className="app" data-toddler={toddlerRoute || undefined}>
      <a className="skip-link" href="#main">
        {t('skip.main')}
      </a>
      <div className="disclaimer-bar" role="note" data-testid="disclaimer-bar">
        {localized(park.disclaimer_bar, lang)}
      </div>
      <header className="site-header">
        <Link to="/" className="app-name" aria-label={`${park.app_name}, ${t('header.home')}`}>
          <span>{park.app_name}</span>
        </Link>
        <div className="header-tools">
          <div className="lang-switch" role="group" aria-label={t('header.lang')}>
            {languages.map((l) => (
              <button
                key={l.code}
                type="button"
                lang={l.code}
                aria-pressed={lang === l.code}
                onClick={() => set({ lang: l.code })}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`toddler-toggle${toddlerRoute ? ' on' : ''}`}
            aria-pressed={toddlerRoute}
            onClick={() => navigate(toddlerRoute ? '/' : '/peuter')}
          >
            <span aria-hidden="true">🐣</span> {toddlerRoute ? t('header.toddler_off') : t('header.toddler')}
          </button>
        </div>
      </header>
      <main id="main" className="content">
        <ParkDataProvider>
          <Outlet />
        </ParkDataProvider>
      </main>
      <footer className="site-footer" data-testid="site-footer">
        {localized(park.footer, lang)}
      </footer>
      {!toddlerRoute && (
        <nav className="tabbar" aria-label={t('nav.main')}>
          <NavLink to="/" end>
            <Icon d="M3 11 12 3l9 8v10h-6v-6H9v6H3z" />
            <span>{t('nav.home')}</span>
          </NavLink>
          <NavLink to="/atlas">
            <Icon d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
            <span>{t('nav.atlas')}</span>
          </NavLink>
          <NavLink to="/kaart">
            <Icon d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2zM9 3v16M15 5v16" />
            <span>{t('nav.map')}</span>
          </NavLink>
          <NavLink to="/over">
            <Icon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5" />
            <span>{t('nav.about')}</span>
          </NavLink>
        </nav>
      )}
    </div>
  )
}
