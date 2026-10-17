// Voorlezen via de Web Speech API van het toestel (geen audio van buiten).
import type { Lang, Level } from '../data/types'

const BCP47: Record<Lang, string> = { nl: 'nl-NL', en: 'en-GB' }

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const want = BCP47[lang]
  return (
    voices.find((v) => v.lang.replace('_', '-') === want) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ??
    null
  )
}

/** Leest de tekst voor; stopt eerst lopend voorlezen. Kind-niveau leest langzamer (0,85). */
export function speak(text: string, lang: Lang, level: Level = 'b1', onEnd?: () => void): boolean {
  if (!isSupported() || !text.trim()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = BCP47[lang]
  const voice = pickVoice(lang)
  if (voice) u.voice = voice
  u.rate = level === 'kind' ? 0.85 : 1
  if (onEnd) {
    u.onend = onEnd
    u.onerror = onEnd
  }
  synth.speak(u)
  return true
}

export function stop(): void {
  if (isSupported()) window.speechSynthesis.cancel()
}
