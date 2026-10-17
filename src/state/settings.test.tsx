import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { _reloadSettingsForTest, getSettings, useSettings } from './settings'

beforeEach(() => {
  localStorage.clear()
  _reloadSettingsForTest()
})

describe('useSettings', () => {
  it('heeft standaardwaarden en zet <html lang> en data-level', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current).toMatchObject({ level: 'b1', lang: 'nl', toddler: false, trackingOptOut: false })
    expect(document.documentElement.lang).toBe('nl')
    expect(document.documentElement.dataset.level).toBe('b1')
  })

  it('slaat wijzigingen op in localStorage en past <html> aan', () => {
    const { result } = renderHook(() => useSettings())
    act(() => result.current.set({ level: 'kenner', lang: 'en' }))
    expect(result.current.level).toBe('kenner')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dataset.level).toBe('kenner')
    expect(JSON.parse(localStorage.getItem('ao-settings')!)).toMatchObject({ level: 'kenner', lang: 'en' })
  })

  it('negeert ongeldige waarden', () => {
    localStorage.setItem('ao-settings', JSON.stringify({ level: 'expert', lang: 'fr', toddler: 'ja' }))
    _reloadSettingsForTest()
    expect(getSettings()).toMatchObject({ level: 'b1', lang: 'nl', toddler: false })
  })

  it('herstelt na kapotte opslag', () => {
    localStorage.setItem('ao-settings', '{kapot')
    _reloadSettingsForTest()
    expect(getSettings().level).toBe('b1')
  })
})
