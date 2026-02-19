import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
