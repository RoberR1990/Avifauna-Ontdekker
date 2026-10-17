// Gebruikersinstellingen, alleen op het toestel (localStorage "ao-settings"). Geen server, geen cookies.
import { useSyncExternalStore } from 'react'
import { defaultLang, park } from '../park'
import type { Lang, Level } from '../data/types'

export interface Settings {
  level: Level
  lang: Lang
  /** Peuterstand aan (volgt de route /peuter). */
  toddler: boolean
  /** Geen anonieme statistieken sturen. */
  trackingOptOut: boolean
}

export type SettingsState = Settings & { set: (patch: Partial<Settings>) => void }

const KEY = 'ao-settings'
const LEVELS: Level[] = ['kind', 'b1', 'kenner']
const supportedLangs = (park.languages as string[]).filter((l): l is Lang => l === 'nl' || l === 'en')

const defaults: Settings = { level: 'b1', lang: defaultLang, toddler: false, trackingOptOut: false }

function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    level: LEVELS.includes(r.level as Level) ? (r.level as Level) : defaults.level,
    lang: supportedLangs.includes(r.lang as Lang) ? (r.lang as Lang) : defaults.lang,
    toddler: r.toddler === true,
    trackingOptOut: r.trackingOptOut === true,
  }
}

function load(): Settings {
  try {
    const s = localStorage.getItem(KEY)
    return sanitize(s ? JSON.parse(s) : null)
  } catch {
    return { ...defaults }
  }
}

function persist(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* opslag geblokkeerd: instellingen gelden dan alleen voor deze sessie */
  }
}

function applyToDocument(s: Settings) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = s.lang
  document.documentElement.dataset.level = s.level
}

const listeners = new Set<() => void>()
let state: SettingsState

function make(s: Settings): SettingsState {
  return { ...s, set }
}

function set(patch: Partial<Settings>) {
  const next = sanitize({ ...state, ...patch })
  if (JSON.stringify(next) === JSON.stringify(pick(state))) return
  state = make(next)
  persist(next)
  applyToDocument(next)
  listeners.forEach((l) => l())
}

function pick(s: Settings): Settings {
  return { level: s.level, lang: s.lang, toddler: s.toddler, trackingOptOut: s.trackingOptOut }
}

state = make(load())
applyToDocument(state)

if (typeof window !== 'undefined') {
  // wijzigingen uit een ander tabblad
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    state = make(load())
    applyToDocument(state)
    listeners.forEach((l) => l())
  })
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const getSnapshot = () => state

/** Huidige instellingen, buiten React (bv. in lib/track.ts of i18n). */
export function getSettings(): SettingsState {
  return state
}

export function useSettings(): SettingsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Alleen voor tests: herlaadt de instellingen uit localStorage. */
export function _reloadSettingsForTest() {
  state = make(load())
  applyToDocument(state)
  listeners.forEach((l) => l())
}
