/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { parkData } from './scripts/park-build/plugin.ts'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_')
  const base = env.VITE_BASE || '/'
  const parkDir = `${root}parks/${env.VITE_PARK || 'avifauna'}`
  const park = JSON.parse(readFileSync(`${parkDir}/park.json`, 'utf8')) as {
    app_name: string
    languages: ('nl' | 'en')[]
    default_language: string
    theme: { primary: string; background: string }
  }

  return {
    base,
    resolve: { alias: { '@park': parkDir } },
    plugins: [
      react(),
      parkData({ parkDir, languages: park.languages }),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false, // we registreren zelf in src/main.tsx
        includeAssets: ['icon.svg', 'robots.txt'],
        workbox: {
          // Kern (FASE-1 §2): shell, lettertypen, iconen, bundels, thumbs, kaart-SVG.
          // Grote foto's en audio gaan NIET in de precache maar in runtime-cache "park-media".
          globPatterns: [
            '**/*.{js,css,html,woff2,ico,png}',
            'icon.svg',
            'park/data.*.json',
            'park/media/photos/*-thumb.webp',
            'park/map/*.svg',
          ],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith(`${base}park/media/`),
              handler: 'CacheFirst',
              options: {
                cacheName: 'park-media',
                expiration: { maxEntries: 2000 },
                cacheableResponse: { statuses: [0, 200] },
                rangeRequests: true,
              },
            },
          ],
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
