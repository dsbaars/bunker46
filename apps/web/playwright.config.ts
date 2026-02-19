import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
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
  // CI with E2E_USE_PREVIEW: server is started separately; only start Vite preview (faster than pnpm dev).
  // Local: start full stack with pnpm dev.
  webServer: process.env['E2E_USE_PREVIEW']
    ? {
        command: 'pnpm exec vite preview --port 5173',
        cwd: __dirname,
        url: 'http://localhost:5173',
        reuseExistingServer: false,
        timeout: 30000,
      }
    : {
        command: 'pnpm dev',
        cwd: rootDir,
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env['CI'],
        timeout: 60000,
      },
});
