import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers.js';

// Regression smoke for #14: the refresh token must live ONLY in an httpOnly cookie.
// The access token is kept in memory (never persisted), so a full page reload can only
// restore the session by exchanging the cookie at /api/auth/refresh, and logout must
// clear the cookie server-side (with matching attributes) so the browser drops it.
test.describe('Refresh token httpOnly cookie (#14)', () => {
  test('refresh token lives only in an httpOnly cookie — not in the response body or JS storage', async ({
    page,
  }) => {
    const registerResponse = page.waitForResponse(
      (r) => r.url().includes('/api/auth/register') && r.request().method() === 'POST',
    );
    await registerAndLogin(page);
    const body = (await (await registerResponse).json()) as Record<string, unknown>;

    // Access token is returned to JS (held in memory); the refresh token is NOT in the body.
    expect(body['accessToken'], 'register response returns an access token').toBeTruthy();
    expect(body, 'refresh token must not be in the response body').not.toHaveProperty(
      'refreshToken',
    );

    // The refresh token is set as an httpOnly, SameSite=Lax cookie...
    const refresh = (await page.context().cookies()).find((c) => c.name === 'refresh_token');
    expect(refresh, 'refresh_token cookie is set').toBeTruthy();
    expect(refresh?.httpOnly, 'refresh_token cookie is httpOnly').toBe(true);
    expect(refresh?.sameSite, 'refresh_token cookie is SameSite=Lax').toBe('Lax');

    // ...so JS cannot read it, and nothing token-like is persisted in localStorage.
    expect(await page.evaluate(() => document.cookie)).not.toContain('refresh_token');
    expect((await page.evaluate(() => JSON.stringify(localStorage))).toLowerCase()).not.toContain(
      'refresh',
    );
  });

  test('session survives a full reload via the cookie; logout clears it', async ({ page }) => {
    await registerAndLogin(page);
    await expect(page).toHaveURL(/\/dashboard/);

    // A full reload drops the in-memory access token; the session must be restored by
    // exchanging the httpOnly refresh cookie at /api/auth/refresh.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 5000 });

    // Logout revokes the session and clears the cookie server-side. Wait for the response so
    // the Set-Cookie clear has landed before we assert the cookie is gone.
    const logoutResponse = page.waitForResponse(
      (r) => r.url().includes('/api/auth/logout') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Logout' }).click();
    await logoutResponse;
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    const refreshAfterLogout = (await page.context().cookies()).find(
      (c) => c.name === 'refresh_token',
    );
    expect(refreshAfterLogout, 'refresh_token cookie is cleared on logout').toBeFalsy();

    // After logout there is no cookie to restore from, so a protected route bounces to /login.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
