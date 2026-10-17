import park from '@park/park.json'

export type Lang = 'nl' | 'en'
export type Localized = { nl: string; en: string }

export { park }
export const defaultLang: Lang = park.default_language === 'en' ? 'en' : 'nl'
