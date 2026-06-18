import { expect, test } from '@playwright/test';

/**
 * Happy-path smoke against local Vite + SAM + Supabase demo users.
 * Run: sam local start-api … & cd apps/ui && npm run dev & npm run test:e2e
 */
test('merchant can sign in and create an agreement', async ({ page }) => {
    await page.goto('/');

    const prefillButtons = page.getByRole('button', { name: 'Prefill' });
    const prefillCount = await prefillButtons.count();

    test.skip(prefillCount === 0, 'VITE_DEMO_* env vars required for prefill smoke');

    await prefillButtons.first().click();
    await page.getByRole('button', { name: /sign in/i }).click();

    const createButton = page.getByRole('button', { name: /create agreement/i });
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();

    const merchantInput = page.locator('input[readonly]').first();
    await expect(merchantInput).toHaveValue(/.+/);

    await createButton.click();

    const responsePanel = page.locator('pre.response').last();
    await expect(responsePanel).toBeVisible({ timeout: 15_000 });
    await expect(responsePanel).toContainText(/"agreementId"/);
});
