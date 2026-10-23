import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout : nécessitent l'API (avec données de démonstration) et le site démarrés.
 *   E2E_BASE_URL   URL du site (défaut http://localhost:3000)
 *   E2E_ADMIN_URL  URL de l'application d'administration (défaut http://localhost:3001)
 *   CHROME_PATH    navigateur Chromium à utiliser si celui de Playwright n'est pas installé
 * Voir docs/TESTS.md.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: { baseURL, locale: 'fr-FR', timezoneId: 'Africa/Lome', trace: 'retain-on-failure', launchOptions },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions }, testMatch: /mobile\.spec\.ts/ },
  ],
});
