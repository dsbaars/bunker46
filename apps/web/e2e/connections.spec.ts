import { test, expect } from '@playwright/test';

test.describe('Connections Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth state via localStorage
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem(
        'bunker46-auth/tokens',
        JSON.stringify({
          accessToken: 'mock-token',
          refreshToken: 'mock-refresh',
        }),
      );
    });
  });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/connections');
    await expect(page).toHaveURL(/\/login/);
  });
});
