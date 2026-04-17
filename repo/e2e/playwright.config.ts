import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PetMarket E2E smoke tests.
 *
 * Prerequisites:
 *   The full docker-compose stack must be running before executing these tests:
 *     cd petmarket && docker compose up --build
 *
 *   Frontend:  http://localhost:3000
 *   Backend:   http://localhost:3001
 *   PostgreSQL: localhost:5433
 *
 * Run:
 *   cd e2e && npm install && npx playwright install --with-deps chromium
 *   npx playwright test
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
