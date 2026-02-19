/**
 * Captures full-page screenshots for the README (WebP).
 * Run with: pnpm run e2e:screenshots (requires pnpm dev or E2E_USE_PREVIEW=1 + server running).
 * Screenshots are saved to docs/screenshots/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { test } from '@playwright/test';
import { test as testWithAuth } from './fixtures/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '..', '..', '..', 'docs', 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

const connectionsFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'connections-api.json'),
  'utf-8',
);
const dashboardStatsFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'dashboard-stats-api.json'),
  'utf-8',
);
const nsecKeysFixtureFull = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'nsec-keys-api.json'),
  'utf-8',
);

const ext = '.webp';

async function saveAsWebp(
  page: { screenshot: (opts: { fullPage?: boolean }) => Promise<Buffer> },
  name: string,
  fullPage = true,
) {
  const buffer = await page.screenshot({ fullPage });
  await sharp(buffer)
    .webp({ quality: 85 })
    .toFile(path.join(screenshotsDir, `${name}${ext}`));
}

test('capture login page', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Sign In', exact: true })
    .waitFor({ state: 'visible', timeout: 10000 });
  await saveAsWebp(page, 'login');
});

testWithAuth.describe.configure({ mode: 'serial' });
testWithAuth.setTimeout(60000);

testWithAuth('capture dashboard', async ({ loggedInPage: page }) => {
  await page.route('**/api/dashboard/stats', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: dashboardStatsFixture,
      });
    }
    route.continue();
  });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('heading', { name: 'Dashboard' })
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('17').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText('Active Sessions').waitFor({ state: 'visible', timeout: 5000 });
  await saveAsWebp(page, 'dashboard', false);
});

const nsecKeysFixture = JSON.stringify([
  {
    id: 'cmltmjbw00001ss8rjlsz32ky',
    publicKey: '27b256db6e19c0245f3b9b62c5a2bfd9a90964bd1bc6d20b56107c78203010d0',
    label: 'Test',
  },
]);

testWithAuth('capture connections', async ({ loggedInPage: page }) => {
  await page.route('**/api/connections**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/connections' && route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: connectionsFixture,
      });
    }
    if (url.pathname === '/api/connections/nsec-keys' && route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: nsecKeysFixture,
      });
    }
    route.continue();
  });
  await page.goto('/connections', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('heading', { name: 'Connections' })
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('Satsback.com').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(
    () => {
      const imgs = document.querySelectorAll(
        'img[src*="satsback"], img[src*="primal"], img[src*="nostrudel"]',
      );
      if (imgs.length === 0) return true;
      return Array.from(imgs).every((img) => (img as HTMLImageElement).complete);
    },
    { timeout: 15000 },
  );
  await saveAsWebp(page, 'connections');
});

testWithAuth('capture keys', async ({ loggedInPage: page }) => {
  await page.route('**/api/connections/nsec-keys', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: nsecKeysFixtureFull,
      });
    }
    route.continue();
  });
  await page.goto('/keys', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('heading', { name: 'Nsec Keys' })
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('Test').first().waitFor({ state: 'visible', timeout: 10000 });
  await saveAsWebp(page, 'keys');
});
