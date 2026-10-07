import { defineConfig, devices } from '@playwright/test';

const usePreview = process.env.PLAYWRIGHT_USE_PREVIEW === '1';
const includeStress = process.env.PLAYWRIGHT_STRESS === '1';
const baseURL = usePreview ? 'http://127.0.0.1:4173' : 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testIgnore: includeStress ? [] : ['**/stress.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'pt-BR',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: usePreview
      ? 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort'
      : 'npm run dev -- --port 5173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
