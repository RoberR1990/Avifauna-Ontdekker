import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
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
  const menuRef = useRef<HTMLDivElement>(null)
  // Open voor één route: na navigeren is het menu vanzelf dicht.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null)
  const menuOpen = menuOpenAt === pathname
  const closeMenu = useCallback(() => setMenuOpenAt(null), [])
  const toddlerRoute = pathname === '/peuter'
  const languages = LANGS.filter((l) => (park.languages as string[]).includes(l.code))

  // Peuterstand volgt de route, zodat features hem kunnen lezen.
  useEffect(() => {
    set({ toddler: toddlerRoute })
  }, [toddlerRoute, set])

  // Menu sluiten bij tikken buiten het menu of Escape.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [closeMenu])

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
        {!toddlerRoute && (
          <div className="header-menu" ref={menuRef}>
            <button
              type="button"
              className="header-menu__button"
              aria-label={t('header.menu')}
              aria-expanded={menuOpen}
              aria-controls="header-menu-panel"
              onClick={() => setMenuOpenAt(menuOpen ? null : pathname)}
            >
              <Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20" />
              <span lang={lang}>{lang.toUpperCase()}</span>
            </button>
            <div className="header-menu__panel" id="header-menu-panel" hidden={!menuOpen}>
              <div className="lang-switch" role="group" aria-label={t('header.lang')}>
                {languages.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    lang={l.code}
                    aria-pressed={lang === l.code}
                    onClick={() => {
                      set({ lang: l.code })
                      closeMenu()
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <Link to="/peuter" className="toddler-link" onClick={closeMenu}>
                <span aria-hidden="true">🐣</span> {t('header.toddler')}
              </Link>
            </div>
          </div>
        )}
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
