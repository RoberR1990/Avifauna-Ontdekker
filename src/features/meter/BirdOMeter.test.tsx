import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BundleSpecies } from '../../data/types'
import { BirdOMeter } from './BirdOMeter'

const sp = (f: object | null) =>
  ({ slug: 'a-b', facts: f && { is_bird: true, length_cm: null, height_cm: null, mass_g: null, wingspan_cm: null, ...f }, wikidata: { wingspan_cm: null, mass_g: null, lifespan_y: null } }) as unknown as BundleSpecies

describe('BirdOMeter', () => {
  it('rendert niets zonder vergelijkingen', () => {
    const { container } = render(<BirdOMeter species={sp({})} lang="nl" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('toont zin en detail, decoratie is aria-hidden', () => {
    const { container } = render(<BirdOMeter species={sp({ length_cm: [56, 70], mass_g: [3600, 5900], wingspan_cm: [195, 250] })} lang="nl" />)
    expect(screen.getByText('Vogel-o-meter')).toBeInTheDocument()
    expect(screen.getByText(/bijna zo lang als een kind van 1/)).toBeInTheDocument()
    expect(screen.getByText('Lengte ongeveer 56–70 cm')).toBeInTheDocument()
    const figs = container.querySelectorAll('.bom-fig')
    expect(figs).toHaveLength(3)
    figs.forEach((f) => expect(f).toHaveAttribute('aria-hidden', 'true'))
  })
  it('Engels', () => {
    render(<BirdOMeter species={sp({ mass_g: [75, 157] })} lang="en" />)
    expect(screen.getByText('Bird-o-meter')).toBeInTheDocument()
    expect(screen.getByText(/hen's eggs/)).toBeInTheDocument()
  })
})
