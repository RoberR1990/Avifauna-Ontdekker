import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BundleSpecies } from '../../data/types'
import { CONTINENT_PATHS } from './continents'
import { OriginMap } from './OriginMap'

const alphen = { lat: 52.13, lon: 4.66 }
const sp = (facts: Partial<NonNullable<BundleSpecies['facts']>> | null) =>
  ({ slug: 'a-b', name: 'Humboldtpinguïn', facts: facts && { continents: [], range_center: null, range: null, ...facts } }) as unknown as BundleSpecies

describe('OriginMap', () => {
  it('rendert niets zonder continenten en range_center', () => {
    const { container } = render(<OriginMap species={sp({})} lang="nl" parkCenter={alphen} />)
    expect(container).toBeEmptyDOMElement()
    const r2 = render(<OriginMap species={sp(null)} lang="nl" parkCenter={alphen} />)
    expect(r2.container).toBeEmptyDOMElement()
  })
  it('toont afstand, alt-tekst en gekleurd continent', () => {
    const { container } = render(
      <OriginMap species={sp({ continents: ['south-america'], range_center: { lat: -12, lon: -77 } })} lang="nl" parkCenter={alphen} parkName="Avifauna" />,
    )
    expect(screen.getByText('± 10.500 km')).toBeInTheDocument()
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Humboldtpinguïn.*Zuid-Amerika.*Avifauna ligt ongeveer 10\.500 km/)
    expect(container.querySelectorAll('.om-land.on')).toHaveLength(1)
  })
  it('alleen continent: geen pin, geen afstand', () => {
    const { container } = render(<OriginMap species={sp({ continents: ['africa'] })} lang="en" parkCenter={alphen} />)
    expect(container.querySelector('.om-pin')).toBeNull()
    expect(container.textContent).not.toMatch(/km/)
  })
})

describe('continents.ts', () => {
  it('blijft onder 40 kB', () => {
    expect(JSON.stringify(CONTINENT_PATHS).length).toBeLessThan(40_000)
  })
})
