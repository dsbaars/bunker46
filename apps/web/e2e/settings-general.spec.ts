import { test as testWithAuth } from './fixtures/auth.js';
import { expect } from '@playwright/test';

testWithAuth.describe('Settings General', () => {
  testWithAuth(
    'should change date/time format, save, and persist after navigation',
    async ({ loggedInPage: page }) => {
      await page.goto('/settings/general');
      await expect(page.getByRole('heading', { name: 'General Settings' })).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByRole('heading', { name: 'Date & Time Format' })).toBeVisible();

      // Wait for loading to finish (radio buttons and Save button visible)
      await expect(page.getByRole('button', { name: 'Save Preferences' })).toBeVisible({
        timeout: 10000,
      });

      // Change date format to DD/MM/YYYY
      await page.getByRole('radio', { name: /DD\/MM\/YYYY/ }).click();
      // Change time format to 24-hour
      await page.getByRole('radio', { name: /24-hour/ }).click();

      await page.getByRole('button', { name: 'Save Preferences' }).click();
      await expect(page.getByText('Preferences saved.')).toBeVisible({ timeout: 5000 });

      // Navigate away and back to assert persistence
      await page.getByRole('link', { name: 'Keys' }).click();
      await expect(page).toHaveURL(/\/keys/);
      await page.getByRole('link', { name: 'Settings' }).click();
      await expect(page).toHaveURL(/\/settings\/general/);

      await expect(page.getByRole('heading', { name: 'General Settings' })).toBeVisible({
        timeout: 5000,
      });
      // DD/MM/YYYY and 24-hour should still be selected
      await expect(page.getByRole('radio', { name: /DD\/MM\/YYYY/ })).toBeChecked();
      await expect(page.getByRole('radio', { name: /24-hour/ })).toBeChecked();
    },
  );
});
