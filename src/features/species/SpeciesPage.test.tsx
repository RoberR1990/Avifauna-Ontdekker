import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BundleAttribution, BundleSpecies, ParkBundle } from '../../data/types'
import { _reloadSettingsForTest, getSettings } from '../../state/settings'
import { SpeciesPage } from './SpeciesPage'
import { mass, range } from './format'

const photoAttr: BundleAttribution = {
  slug: 'pinguin', kind: 'photo', source: 'wikimedia-commons', source_url: 'https://commons.example/foto',
  creator: 'Fotograaf Foto', license: 'CC-BY-SA-4.0', license_url: 'https://cc.example/by-sa', title: 'Foto', retrieved: '2026-10-17', modified: 'bijgesneden', url: 'x',
}
const audioAttr: BundleAttribution = {
  slug: 'pinguin', kind: 'audio', source: 'xeno-canto', source_url: 'https://xeno-canto.org/1',
  creator: 'Geluid Maker', license: 'CC-BY-NC-SA-4.0', license_url: 'https://cc.example/nc', title: 'XC1', retrieved: '2026-10-17', modified: null, url: 'y',
}

const L = (nl: string, en: string) => ({ nl, en })
const facts = {
  slug: 'pinguin', reviewed: false, is_bird: true,
  length_cm: [56, 70], height_cm: null, mass_g: [3600, 5900], wingspan_cm: null,
  lifespan_wild_y: null, lifespan_captivity_y: [18, 32], clutch: L('Meestal 2 eieren', 'Usually 2 eggs'), incubation_days: [41, 41],
  continents: ['south-america'], range: L('Kust van Peru', 'Coast of Peru'), range_center: { lat: -22, lon: -72 },
  habitat: null, diet: L('Vis', 'Fish'), colors: ['black'], iucn_trend: 'decreasing', threats: null,
  wow: L('Wow-feit!', 'Wow fact!'), sources: [{ title: 'Bron F', url: 'https://f.example' }],
}

const pinguin = {
  slug: 'pinguin', scientific_name: 'Spheniscus humboldti', name: 'Humboldtpinguïn', name_alt: null,
  order: 'Sphenisciformes', family: 'Spheniscidae', iucn: 'VU', wikidata: { wingspan_cm: null, mass_g: null, lifespan_y: null },
  zone_id: 'z1', place_id: 'v1', last_seen: '2026-10-01', status: 'draft',
  photo: { url: 'park/p.webp', thumb_url: 'park/t.webp', attribution: 0 },
  audio: { opus_url: 'park/a.opus', m4a_url: 'park/a.m4a', attribution: 1 },
  links: { wikipedia: 'https://wiki.example', xeno_canto: 'https://xeno-canto.org/s', wikidata: 'https://wd.example', park: 'https://park.example/pinguin' },
  facts, size_class: 'large',
  text: { lang: 'nl', kind: 'Kindtekst hier.', b1: 'Gewone tekst.\n\nTweede alinea.', kenner: 'Kennertekst.', sources: [{ title: 'Bron T', url: 'https://t.example' }], reviewed: false },
} as unknown as BundleSpecies

const kaal = {
  slug: 'kaal', scientific_name: 'Nudus avis', name: 'Kale vogel', name_alt: null, order: null, family: null, iucn: null,
  wikidata: { wingspan_cm: null, mass_g: null, lifespan_y: null }, zone_id: null, place_id: null, last_seen: null, status: 'draft',
  photo: null, audio: null, links: { wikipedia: null, xeno_canto: null, wikidata: null, park: null }, facts: null, size_class: null, text: null,
} as unknown as BundleSpecies

const bundle = {
  park: { center: { lat: 52.1, lon: 4.6 }, park_name: 'Avifauna', links: { official_site: 'https://o.example', programme: 'https://p.example/programma' } },
  species: [pinguin, kaal],
  attributions: [photoAttr, audioAttr],
  places: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: null, properties: { id: 'v1', kind: 'enclosure', name_nl: 'Pinguïnverblijf', name_en: 'Penguin house' } },
      { type: 'Feature', geometry: null, properties: { id: 'z1', kind: 'zone', name_nl: 'Grote vijver' } },
    ],
  },
  programme: { last_checked: '2026-10-17', source_url: 'https://p.example', items: [{ time: '14:00', title: L('Pinguïnvoeren', 'Penguin feeding'), species: ['pinguin'] }] },
} as unknown as ParkBundle

vi.mock('../../data/ParkDataProvider', () => ({
  useBundle: () => bundle,
  useSpecies: (slug?: string) => bundle.species.find((s) => s.slug === slug),
  mediaUrl: (r: string) => `/${r}`,
}))

function renderAt(slug: string, level: 'kind' | 'b1' | 'kenner', lang: 'nl' | 'en' = 'nl') {
  getSettings().set({ level, lang })
  return render(
    <MemoryRouter initialEntries={[`/soort/${slug}`]}>
      <Routes>
        <Route path="soort/:slug" element={<SpeciesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  _reloadSettingsForTest()
})

const sp = (v: string | null) => v?.replaceAll(String.fromCharCode(160), ' ') ?? null

describe('format', () => {
  it('ranges in NL- en EN-notatie', () => {
    expect(sp(mass([3600, 5900], 'nl'))).toBe('3,6–5,9 kg')
    expect(sp(mass([3600, 5900], 'en'))).toBe('3.6–5.9 kg')
    expect(sp(range([56, 70], 'cm', 'nl'))).toBe('56–70 cm')
    expect(sp(range([41, 41], 'x', 'nl'))).toBe('41 x')
    expect(sp(range(null, 'cm', 'nl'))).toBeNull()
  })
})

describe('SpeciesPage', () => {
  it('kind: kindtekst, wow, foto-attributie en geluid met attributie', () => {
    const { container } = renderAt('pinguin', 'kind')
    expect(screen.getByText('Kindtekst hier.')).toBeInTheDocument()
    expect(screen.getByText('Wow-feit!')).toBeInTheDocument()
    expect(screen.getByText('Concepttekst, nog niet gecontroleerd')).toBeInTheDocument()
    const photo = screen.getByTestId('credit-photo')
    expect(photo).toHaveTextContent('Fotograaf Foto')
    expect(photo).toHaveTextContent('bewerkt')
    expect(photo.querySelector('a[href="https://cc.example/by-sa"]')).not.toBeNull()
    expect(photo.querySelector('a[href="https://commons.example/foto"]')).not.toBeNull()
    const audio = screen.getByTestId('credit-audio')
    expect(audio).toHaveTextContent('CC-BY-NC-SA-4.0')
    expect(audio).toHaveTextContent('via xeno-canto.org')
    expect(container.querySelector('audio source[type="audio/mp4"]')).not.toBeNull()
    expect(container.querySelector('img[fetchpriority="high"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Kind/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('iedereen: meter, alinea\'s, herkomst, park met kaartlink en programma', () => {
    renderAt('pinguin', 'b1')
    expect(screen.getByText('Vogel-o-meter')).toBeInTheDocument()
    expect(screen.getByText('Tweede alinea.')).toBeInTheDocument()
    expect(screen.getByText('Waar woont hij?')).toBeInTheDocument()
    expect(screen.getByText('Pinguïnverblijf · Grote vijver')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bekijk op de kaart' })).toHaveAttribute('href', '/kaart?plek=v1')
    expect(screen.getByText('Pinguïnvoeren', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/Check altijd/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Programma van het park' })).toHaveAttribute('href', 'https://p.example/programma')
    expect(screen.getByRole('link', { name: 'Pagina op de officiële website' })).toHaveAttribute('href', 'https://park.example/pinguin')
    expect(screen.getByRole('link', { name: 'Alle bronnen en licenties' })).toHaveAttribute('href', '/bronnen')
  })

  it('kenner: feitenblok met ranges, ontbrekende rijen vervallen, links en bronnen', () => {
    const { container } = renderAt('pinguin', 'kenner')
    const dts = [...container.querySelectorAll('dl.facts dt')].map((e) => e.textContent)
    expect(dts).toContain('Orde')
    expect(dts).toContain('Gewicht')
    expect(dts).not.toContain('Spanwijdte')
    expect(dts).not.toContain('Hoogte')
    expect(dts).not.toContain('Leefgebied')
    expect(screen.getByText('3,6–5,9 kg')).toBeInTheDocument()
    expect(screen.getByText('56–70 cm')).toBeInTheDocument()
    expect(screen.getByText('41 dagen')).toBeInTheDocument()
    expect(screen.getByText(/VU · Kwetsbaar, aantal neemt af/)).toBeInTheDocument()
    expect(screen.getByText('Kennertekst.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'xeno-canto' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wikidata' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bron T' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bron F' })).toBeInTheDocument()
  })

  it('niveauwissel wordt onthouden in de instellingen', () => {
    renderAt('pinguin', 'kind')
    fireEvent.click(screen.getByRole('button', { name: 'Kenner' }))
    expect(getSettings().level).toBe('kenner')
    expect(screen.getByText('Kerngegevens')).toBeInTheDocument()
  })

  it('Engelse UI met Nederlandse tekst: melding en NL-tekst', () => {
    renderAt('pinguin', 'b1', 'en')
    expect(screen.getByText('(only available in Dutch)')).toBeInTheDocument()
    expect(screen.getByText('Gewone tekst.')).toBeInTheDocument()
    expect(screen.getByText('Where does it live?')).toBeInTheDocument()
  })

  it('soort zonder tekst, foto en geluid: alleen feiten, geen lege secties', () => {
    for (const level of ['kind', 'b1', 'kenner'] as const) {
      const { container, unmount } = renderAt('kaal', level)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kale vogel')
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('audio')).toBeNull()
      expect(screen.queryByText('Hoor hem')).toBeNull()
      expect(screen.queryByText('Concepttekst, nog niet gecontroleerd')).toBeNull()
      unmount()
    }
    renderAt('kaal', 'b1')
    expect(screen.getByText(/nog geen tekst/)).toBeInTheDocument()
  })

  it('onbekende soort: melding', () => {
    renderAt('bestaat-niet', 'b1')
    expect(screen.getByText(/bestaat niet/)).toBeInTheDocument()
  })

  it('voorleesknop alleen met speechSynthesis', () => {
    renderAt('pinguin', 'kind')
    expect(screen.queryByRole('button', { name: 'Lees voor' })).toBeNull()
  })
})
