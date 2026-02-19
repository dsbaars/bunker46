import { test, expect } from '@playwright/test';
import { registerAndLogin, login, clearAuthStorage } from './helpers.js';

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
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
  });

  test('should show validation error on empty login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 5000 });
  });

  test('should show TOTP verification page', async ({ page }) => {
    await page.goto('/2fa/verify');
    await expect(page.getByText('Two-Factor Authentication')).toBeVisible();
  });

  // TOTP full flow (login → 2FA page → enter code → dashboard) skipped: requires a seeded test user with TOTP enabled and a known secret to generate codes. See docs/TEST_COVERAGE.md.
  test.skip('should complete login with TOTP when user has 2FA enabled', async ({ page }) => {
    await page.goto('/login');
    // Would fill username/password of TOTP user, submit, then fill 6-digit code, then assert dashboard
  });

  test('should register and redirect to dashboard', async ({ page }) => {
    await registerAndLogin(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
    const { username, password } = await registerAndLogin(page);
    await clearAuthStorage(page);
    await login(page, username, password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should show error on login with invalid password', async ({ page }) => {
    const { username } = await registerAndLogin(page);
    await clearAuthStorage(page);
    await page.goto('/login');
    await page.getByPlaceholder('Enter username').fill(username);
    await page.getByPlaceholder('Enter password').fill('WrongPassword1!');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 5000 });
  });

  test('should redirect to dashboard when authenticated user visits /login', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
