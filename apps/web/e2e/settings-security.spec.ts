import { test as testWithAuth } from './fixtures/auth.js';
import { expect } from '@playwright/test';
import { DEFAULT_PASSWORD } from './helpers.js';

testWithAuth.describe('Settings Security', () => {
  testWithAuth(
    'should show Security Settings with sessions list and change password form',
    async ({ loggedInPage: page }) => {
      await page.goto('/settings/security');
      await expect(page.getByRole('heading', { name: 'Security Settings' })).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByRole('heading', { name: 'Active Sessions' })).toBeVisible();
      await expect(
        page
          .getByText('This device')
          .or(page.getByText('No sessions found.'))
          .or(page.getByText('Loading…')),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Update Password' })).toBeVisible();
    },
  );

  testWithAuth(
    'should show error when changing password with wrong current password',
    async ({ loggedInPage: page }) => {
      await page.goto('/settings/security');
      await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible({
        timeout: 5000,
      });
      await page.getByPlaceholder('Enter current password').fill('WrongPassword1!');
      await page.getByPlaceholder('At least 8 characters').fill('NewPassword1!');
      await page.getByPlaceholder('Repeat new password').fill('NewPassword1!');
      await page.getByRole('button', { name: 'Update Password' }).click();
      await expect(page.getByText(/invalid|incorrect|current password/i)).toBeVisible({
        timeout: 5000,
      });
    },
  );

  testWithAuth('should change password and show success', async ({ loggedInPage: page }) => {
    await page.goto('/settings/security');
    await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible({
      timeout: 5000,
    });
    const newPassword = 'NewPassword2!';
    await page.getByPlaceholder('Enter current password').fill(DEFAULT_PASSWORD);
    await page.getByPlaceholder('At least 8 characters').fill(newPassword);
    await page.getByPlaceholder('Repeat new password').fill(newPassword);
    await page.getByRole('button', { name: 'Update Password' }).click();
    await expect(page.getByText(/updated|success/i)).toBeVisible({ timeout: 5000 });
  });
});
