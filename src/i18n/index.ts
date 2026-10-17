import { useCallback } from 'react'
import { defaultLang, type Lang, type Localized } from '../park'
import { getSettings, useSettings } from '../state/settings'
import { en } from './en'
import { nl, type Key } from './nl'

const dictionaries: Record<Lang, Record<Key, string>> = { nl, en }

/** Vertaling; zonder lang geldt de taal uit de instellingen. In componenten liever useT(). */
export function t(key: Key, lang: Lang = getSettings().lang ?? defaultLang): string {
  return dictionaries[lang][key] ?? nl[key]
}

export function localized(value: Localized | { nl: string; en?: string | null }, lang: Lang = getSettings().lang): string {
  return value[lang] ?? value.nl
}

/** Hook: t(key) in de taal uit de instellingen; rendert opnieuw bij taalwissel. */
export function useT(): (key: Key) => string {
  const { lang } = useSettings()
  return useCallback((key: Key) => t(key, lang), [lang])
}

/** Hook: localized(...) in de taal uit de instellingen. */
export function useLocalized(): (value: { nl: string; en?: string | null }) => string {
  const { lang } = useSettings()
  return useCallback((value) => localized(value, lang), [lang])
}

/**
 * Eigen woordenboek per feature:
 *   const useT = makeT({ nl: { title: 'Atlas' }, en: { title: 'Atlas' } })
 *   const t = useT(); t('title')
 * Ontbrekende en-sleutel valt terug op nl.
 */
export function makeT<K extends string>(dict: { nl: Record<K, string>; en: Partial<Record<K, string>> }) {
  return function useFeatureT(): (key: K) => string {
    const { lang } = useSettings()
    return useCallback((key: K) => (dict[lang] as Partial<Record<K, string>>)[key] ?? dict.nl[key], [lang])
  }
}

export type { Key }
