import type { Page } from '@playwright/test';
import { test as base } from '@playwright/test';
import { registerAndLogin } from '../helpers.js';

/**
 * Extended test with loggedInPage fixture: a page that has already registered and is on the dashboard.
 */
export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await registerAndLogin(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
