import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSupported, speak, stop } from './speech'

afterEach(() => {
  const w = window as unknown as Record<string, unknown>
  delete w.speechSynthesis
  delete w.SpeechSynthesisUtterance
})

function mockSpeech() {
  const synth = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: () => [
      { lang: 'en-US', name: 'US' },
      { lang: 'nl_NL', name: 'NL' },
      { lang: 'en-GB', name: 'GB' },
    ],
  }
  Object.assign(window, {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class {
      lang = ''
      rate = 1
      voice: unknown = null
      constructor(public text: string) {}
    },
  })
  return synth
}

describe('speech', () => {
  it('meldt niet-ondersteund en doet dan niets', () => {
    expect(isSupported()).toBe(false)
    expect(speak('hallo', 'nl')).toBe(false)
    expect(() => stop()).not.toThrow()
  })

  it('kiest nl-NL en en-GB stem en vertraagt voor kind', () => {
    const synth = mockSpeech()
    expect(speak('hallo', 'nl', 'kind')).toBe(true)
    const u = synth.speak.mock.calls[0][0]
    expect(u.lang).toBe('nl-NL')
    expect(u.voice.name).toBe('NL')
    expect(u.rate).toBe(0.85)
    speak('hello', 'en', 'b1')
    const u2 = synth.speak.mock.calls[1][0]
    expect(u2.voice.name).toBe('GB')
    expect(u2.rate).toBe(1)
    expect(synth.cancel).toHaveBeenCalledTimes(2)
  })
})
