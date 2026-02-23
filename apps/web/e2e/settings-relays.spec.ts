import { test as testWithAuth } from './fixtures/auth.js';
import { expect } from '@playwright/test';

testWithAuth.describe('Settings Relays', () => {
  testWithAuth(
    'should show relay configuration with list or empty state',
    async ({ loggedInPage: page }) => {
      await page.goto('/settings/relays');
      await expect(page.getByRole('heading', { name: 'Relay Configuration' })).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByRole('heading', { name: 'Active Relays' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save Relays' })).toBeVisible({
        timeout: 10000,
      });
    },
  );

  testWithAuth('should add and remove a relay', async ({ loggedInPage: page }) => {
    await page.goto('/settings/relays');
    await expect(page.getByRole('heading', { name: 'Active Relays' })).toBeVisible({
      timeout: 10000,
    });
    const testRelay = 'wss://e2e-test.relay.example.com';
    await page.getByPlaceholder('wss://relay.example.com').fill(testRelay);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(testRelay)).toBeVisible();
    // Remove the relay we added (scope to the Active Relays row to avoid matching parent divs)
    await page
      .locator('div.flex.items-center.justify-between')
      .filter({ hasText: testRelay })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(page.getByText(testRelay)).not.toBeVisible();
  });

  testWithAuth(
    'should show validation error for invalid relay URL',
    async ({ loggedInPage: page }) => {
      await page.goto('/settings/relays');
      await expect(page.getByRole('heading', { name: 'Active Relays' })).toBeVisible({
        timeout: 10000,
      });
      await page.getByPlaceholder('wss://relay.example.com').fill('invalid-url');
      await page.getByRole('button', { name: 'Add' }).click();
      await expect(page.getByText(/must start with wss:\/\/ or ws:\/\//)).toBeVisible();
    },
  );
});
