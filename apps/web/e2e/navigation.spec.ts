import { test as testWithAuth } from './fixtures/auth.js';
import { expect } from '@playwright/test';

testWithAuth.describe('Sidebar navigation', () => {
  testWithAuth(
    'should navigate from dashboard to Keys, Connections, Relays, Security, Settings',
    async ({ loggedInPage: page }) => {
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      // Keys
      await page.getByRole('link', { name: 'Keys' }).click();
      await expect(page).toHaveURL(/\/keys/);
      await expect(page.getByRole('heading', { name: 'Nsec Keys' })).toBeVisible({ timeout: 5000 });

      // Connections
      await page.getByRole('link', { name: 'Connections' }).click();
      await expect(page).toHaveURL(/\/connections/);
      await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible({
        timeout: 5000,
      });

      // Relays (sidebar label "Relays", path /settings/relays)
      await page.getByRole('link', { name: 'Relays' }).click();
      await expect(page).toHaveURL(/\/settings\/relays/);
      await expect(page.getByRole('heading', { name: 'Relay Configuration' })).toBeVisible({
        timeout: 5000,
      });

      // Security
      await page.getByRole('link', { name: 'Security' }).click();
      await expect(page).toHaveURL(/\/settings\/security/);
      await expect(page.getByRole('heading', { name: 'Security Settings' })).toBeVisible({
        timeout: 5000,
      });

      // Settings (general)
      await page.getByRole('link', { name: 'Settings' }).click();
      await expect(page).toHaveURL(/\/settings\/general/);
      await expect(page.getByRole('heading', { name: 'General Settings' })).toBeVisible({
        timeout: 5000,
      });

      // Back to Dashboard
      await page.getByRole('link', { name: 'Dashboard' }).click();
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    },
  );
});
