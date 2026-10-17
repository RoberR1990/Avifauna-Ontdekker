import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { park } from './park'
import './styles.css'

// Thema uit het parkpakket als CSS-variabelen
const root = document.documentElement
root.style.setProperty('--color-primary', park.theme.primary)
root.style.setProperty('--color-bg', park.theme.background)
root.style.setProperty('--color-text', park.theme.text)
document.title = park.app_name

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
