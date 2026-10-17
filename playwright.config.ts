import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, serviceWorkers: 'allow' },
  projects: [
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    {
      // iPhone 14-afmetingen op chromium (alleen chromium is geïnstalleerd)
      name: 'iphone-14-viewport',
      use: {
        browserName: 'chromium',
        viewport: devices['iPhone 14'].viewport,
        userAgent: devices['iPhone 14'].userAgent,
        deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
        isMobile: false,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
