// Opmaak van waarden voor de soortpagina. Ontbrekend (null) -> null, zodat de rij vervalt.
import type { Lang, Range, Trend } from '../../data/types'

const LOCALE: Record<Lang, string> = { nl: 'nl-NL', en: 'en-GB' }

export function num(n: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 1 }).format(n)
}

/** "56–70 cm" / "56 cm". Bij min === max één waarde. */
export function range(r: Range | null | undefined, unit: string, lang: Lang): string | null {
  if (!r) return null
  const [a, b] = r
  const body = a === b ? num(a, lang) : `${num(a, lang)}–${num(b, lang)}`
  return body + String.fromCharCode(160) + unit
}

/** Gewicht in g, vanaf 1 kg in kg ("3,6–5,9 kg", "2.9–6 kg" in EN-notatie). */
export function mass(r: Range | null | undefined, lang: Lang): string | null {
  if (!r) return null
  if (r[1] >= 1000) return range([r[0] / 1000, r[1] / 1000], 'kg', lang)
  return range(r, 'g', lang)
}

export function years(r: Range | null | undefined, lang: Lang): string | null {
  if (!r) return null
  const unit = r[1] === 1 ? (lang === 'nl' ? 'jaar' : 'year') : lang === 'nl' ? 'jaar' : 'years'
  return range(r, unit, lang)
}

export function days(r: Range | null | undefined, lang: Lang): string | null {
  if (!r) return null
  const unit = lang === 'nl' ? 'dagen' : 'days'
  return range(r, r[1] === 1 ? (lang === 'nl' ? 'dag' : 'day') : unit, lang)
}

export const TREND_KEYS: Record<Trend, 'trend.decreasing' | 'trend.stable' | 'trend.increasing' | 'trend.unknown'> = {
  decreasing: 'trend.decreasing',
  stable: 'trend.stable',
  increasing: 'trend.increasing',
  unknown: 'trend.unknown',
}

/** Tekst in paragrafen (lege regel = nieuwe alinea). */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}
