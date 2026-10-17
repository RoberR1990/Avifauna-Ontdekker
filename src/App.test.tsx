import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { park } from './park'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  it('toont de disclaimerbalk en de footer uit park.json', () => {
    renderAt('/')
    expect(screen.getByTestId('disclaimer-bar')).toHaveTextContent(park.disclaimer_bar.nl)
    expect(screen.getByTestId('site-footer')).toHaveTextContent(park.footer.nl)
  })

  it('toont de balk ook op de Over-pagina', () => {
    renderAt('/over')
    expect(screen.getByTestId('disclaimer-bar')).toHaveTextContent(park.disclaimer_bar.nl)
  })
})

describe('Over-pagina', () => {
  it('noemt de bouwer', () => {
    renderAt('/over')
    expect(screen.getByText(/Robert Riteco/)).toBeInTheDocument()
  })

  it('bevat privacyverklaring en link naar de officiële site', () => {
    renderAt('/over')
    expect(screen.getByText(/Geen accounts, geen cookies, geen tracking/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /officiële website/i })).toHaveAttribute('href', park.links.official_site)
  })
})
