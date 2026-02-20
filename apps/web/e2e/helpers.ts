import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const DEFAULT_PASSWORD = 'TestPassword1!';

/**
 * Clear auth state (localStorage + localforage IndexedDB) so the app sees the user as logged out.
 */
export async function clearAuthStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('bunker46-auth');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

export interface RegisterOptions {
  username?: string;
  password?: string;
}

/**
 * Register a new user via the UI and wait for redirect to dashboard.
 * Uses a unique username by default (e2e-<timestamp>) so tests can run in parallel.
 * Returns the credentials used so callers can log in again if needed.
 */
export async function registerAndLogin(
  page: Page,
  options: RegisterOptions = {},
): Promise<{ username: string; password: string }> {
  const username =
    options.username ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const password = options.password ?? DEFAULT_PASSWORD;

  await page.goto('/register');
  await page.getByPlaceholder('Choose a username').fill(username);
  await page.getByPlaceholder('At least 8 characters').fill(password);
  await page.getByPlaceholder('Repeat password').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  try {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 5000 });
  } catch (err) {
    const errText = await page
      .locator('.text-destructive')
      .first()
      .textContent()
      .catch(() => '');
    throw new Error(
      `Register did not redirect to dashboard.${errText ? ` Page error: ${errText.trim()}` : ''}`,
      { cause: err },
    );
  }

  return { username, password };
}

/**
 * Log in via the UI with the given credentials. Waits for redirect to dashboard.
 */
export async function login(page: Page, username: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Enter username').fill(username);
  await page.getByPlaceholder('Enter password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  try {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  } catch (err) {
    const errText = await page
      .locator('.text-destructive')
      .first()
      .textContent()
      .catch(() => '');
    throw new Error(
      `Login did not redirect to dashboard.${errText ? ` Page error: ${errText.trim()}` : ''}`,
      { cause: err },
    );
  }
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 5000 });
}
