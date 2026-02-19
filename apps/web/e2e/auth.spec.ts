import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page by default', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Welcome to Bunker46')).toBeVisible();
  });

  test('should show register link on login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Register')).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Register').click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByText('Create Account')).toBeVisible();
  });

  test('should show validation error on empty login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign In' }).click();
    // The API call should fail, check for error
    await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 5000 });
  });

  test('should show TOTP verification page', async ({ page }) => {
    await page.goto('/2fa/verify');
    await expect(page.getByText('Two-Factor Authentication')).toBeVisible();
  });
});
