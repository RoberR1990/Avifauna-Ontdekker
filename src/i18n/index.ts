import { defaultLang, type Lang, type Localized } from '../park'
import { en } from './en'
import { nl, type Key } from './nl'

const dictionaries: Record<Lang, Record<Key, string>> = { nl, en }

export function t(key: Key, lang: Lang = defaultLang): string {
  return dictionaries[lang][key] ?? nl[key]
}

export function localized(value: Localized, lang: Lang = defaultLang): string {
  return value[lang] ?? value.nl
}

export type { Key }
