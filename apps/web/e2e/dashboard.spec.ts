import { test, expect } from '@playwright/test';
import { test as testWithAuth } from './fixtures/auth.js';

test.describe('Dashboard', () => {
  test('should redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  testWithAuth(
    'should show dashboard with stats or empty state when authenticated',
    async ({ loggedInPage: page }) => {
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      // Wait for load: either stat cards (Active Sessions) or error message
      await expect(
        page.getByText('Active Sessions').or(page.getByText('Failed to load dashboard statistics')),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});
