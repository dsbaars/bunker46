import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Default: run only Chromium so `pnpm exec playwright install chromium` is enough.
  // For full matrix, set PLAYWRIGHT_PROJECTS=all and install all browsers.
  projects:
    process.env['PLAYWRIGHT_PROJECTS'] === 'all'
      ? [
          { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
          { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
          { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
        ]
      : [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }],
  // Full stack: start both NestJS (port 3000) and Vite (5173) from monorepo root so API works.
  webServer: {
    command: 'pnpm dev',
    cwd: rootDir,
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60000,
  },
});
