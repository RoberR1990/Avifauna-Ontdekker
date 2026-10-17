/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_')
  const base = env.VITE_BASE || '/'
  const parkDir = `${root}parks/${env.VITE_PARK || 'avifauna'}`
  const park = JSON.parse(readFileSync(`${parkDir}/park.json`, 'utf8')) as {
    app_name: string
    default_language: string
    theme: { primary: string; background: string }
  }

  return {
    base,
    resolve: { alias: { '@park': parkDir } },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false, // we registreren zelf in src/main.tsx
        includeAssets: ['icon.svg', 'robots.txt'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,json,woff2}'],
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        manifest: {
          name: park.app_name,
          short_name: park.app_name,
          lang: park.default_language,
          start_url: base,
          scope: base,
          display: 'standalone',
          theme_color: park.theme.primary,
          background_color: park.theme.background,
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
      globals: true,
    },
  }
})
