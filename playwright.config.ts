import { defineConfig, devices } from '@playwright/test'

const pages = process.env.NUTRITRACK_PAGES_TEST === '1'
const baseURL = `http://127.0.0.1:4173${pages ? '/NutriTrack/' : '/'}`
const buildCommand = pages ? 'npm run build:pages' : 'npm run build'
const previewMode = pages ? ' --mode pages' : ''

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 14'], browserName: 'webkit' } },
  ],
  webServer: {
    command: `${buildCommand} && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort${previewMode}`,
    url: baseURL,
    timeout: 120_000,
  },
})
