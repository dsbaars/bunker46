import { test as testWithAuth } from './fixtures/auth.js';
import { expect } from '@playwright/test';

testWithAuth.describe('Keys Page', () => {
  testWithAuth(
    'should show keys list or empty state when authenticated',
    async ({ loggedInPage: page }) => {
      await page.goto('/keys');
      await expect(page).toHaveURL(/\/keys/);
      await expect(page.getByRole('heading', { name: 'Nsec Keys' })).toBeVisible();
      await expect(
        page.getByText('No nsec keys yet').or(page.getByText('Loading keys')),
      ).toBeVisible({ timeout: 10000 });
    },
  );

  testWithAuth(
    'should show validation error when adding invalid nsec',
    async ({ loggedInPage: page }) => {
      await page.goto('/keys');
      await expect(page.getByRole('heading', { name: 'Nsec Keys' })).toBeVisible({ timeout: 5000 });
      // "Import Key" appears in header and empty state; click first to open the import form
      await page
        .getByRole('button', { name: /Import Key/i })
        .first()
        .click();
      await expect(page.getByRole('heading', { name: 'Import Nsec Key' })).toBeVisible();
      await page.getByPlaceholder('nsec1... or hex private key').fill('invalid-input');
      // Scope to the import form card so we click the submit button, not the empty-state button
      const importCard = page.getByRole('heading', { name: 'Import Nsec Key' }).locator('..');
      await importCard.getByRole('button', { name: /Import Key/i }).click();
      await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.text-destructive')).toContainText(/valid nsec|Failed to add/);
    },
  );
});
