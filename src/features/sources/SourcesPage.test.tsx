import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParkBundle } from '../../data/types'
import { _reloadSettingsForTest, getSettings } from '../../state/settings'
import { SourcesPage } from './SourcesPage'

const at = (slug: string, kind: string, creator: string, modified: string | null) => ({
  slug, kind, source: kind === 'audio' ? 'xeno-canto' : 'wikimedia-commons', source_url: `https://s.example/${slug}/${kind}`,
  creator, license: 'CC-BY-4.0', license_url: 'https://cc.example/by', title: `Titel ${slug} ${kind}`, retrieved: '2026-10-17', modified, url: 'x',
})

const bundle = {
  species: [
    { slug: 'zebra', name: 'Zebra' },
    { slug: 'aap', name: 'Aap' },
  ],
  attributions: [at('zebra', 'photo', 'Zed', null), at('aap', 'photo', 'Ann', 'bijgesneden'), at('aap', 'audio', 'Bob', null)],
} as unknown as ParkBundle

vi.mock('../../data/ParkDataProvider', () => ({ useBundle: () => bundle }))

beforeEach(() => {
  localStorage.clear()
  _reloadSettingsForTest()
  getSettings().set({ lang: 'nl' })
})

describe('SourcesPage', () => {
  it('groepeert per soort (op naam), toont alle velden en linkt naar Over', () => {
    render(
      <MemoryRouter>
        <SourcesPage />
      </MemoryRouter>,
    )
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(heads).toEqual(['Veel gebruikte licenties', 'Aap', 'Zebra'])
    const aap = screen.getByRole('heading', { name: 'Aap' }).closest('section') as HTMLElement
    expect(within(aap).getByText('Ann')).toBeInTheDocument()
    expect(within(aap).getByText('Bob')).toBeInTheDocument()
    expect(within(aap).getByText('bijgesneden')).toBeInTheDocument()
    expect(within(aap).getAllByRole('link', { name: 'CC-BY-4.0' })[0]).toHaveAttribute('href', 'https://cc.example/by')
    expect(within(aap).getByRole('link', { name: 'xeno-canto' })).toHaveAttribute('href', 'https://s.example/aap/audio')
    expect(within(aap).getByText('Geluid')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Over deze app' })).toHaveAttribute('href', '/over')
  })
})
