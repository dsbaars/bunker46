import { test, expect } from '@playwright/test';
import { clearAuthStorage } from './helpers.js';
import { test as testWithAuth } from './fixtures/auth.js';

test.describe('Connections Page', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/login');
    await clearAuthStorage(page);
    await page.goto('/connections');
    await expect(page).toHaveURL(/\/login/);
  });

  testWithAuth(
    'should show connections list or empty state when authenticated',
    async ({ loggedInPage: page }) => {
      await page.goto('/connections');
      await expect(page).toHaveURL(/\/connections/);
      await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
      await expect(
        page.getByText('No connections yet').or(page.getByText('Loading connections')),
      ).toBeVisible({ timeout: 10000 });
    },
  );

  testWithAuth(
    'should open generate bunker URI flow when clicking Generate',
    async ({ loggedInPage: page }) => {
      await page.goto('/connections');
      await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible({
        timeout: 5000,
      });
      await page.getByRole('button', { name: 'Generate bunker:// URI' }).first().click();
      await expect(page.getByRole('heading', { name: 'Generate bunker:// URI' })).toBeVisible();
      await expect(page.getByRole('combobox')).toBeVisible({ timeout: 3000 });
    },
  );
});
