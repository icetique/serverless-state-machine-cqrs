import { expect, test } from '@playwright/test';

async function signInWithDemoAccount(page: import('@playwright/test').Page, label: string) {
    await page.goto('/');
    const demoCard = page.locator('.demo-account-card').filter({ hasText: label });
    const prefill = demoCard.getByRole('button', { name: 'Prefill' });

    await expect(prefill).toBeVisible({ timeout: 5_000 });
    await prefill.click();
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15_000 });
}

async function signOut(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 15_000 });
}

/**
 * Multi-role workflow against local Vite + SAM + Supabase demo users.
 * Run: sam local start-api … & cd apps/ui && npm run dev & npm run test:e2e
 */
test('merchant creates, partner approves, merchant funds', async ({ page }) => {
    const prefillCount = await page.goto('/').then(() => page.getByRole('button', { name: 'Prefill' }).count());

    test.skip(prefillCount === 0, 'VITE_DEMO_* env vars required for prefill smoke');

    await signInWithDemoAccount(page, 'Merchant');

    await page.getByRole('button', { name: /create agreement/i }).click();

    const responsePanel = page.locator('pre.response').last();
    await expect(responsePanel).toBeVisible({ timeout: 15_000 });
    const responseText = await responsePanel.textContent();
    expect(responseText).toMatch(/"agreementId":"agr_/);

    const agreementIdMatch = responseText?.match(/"agreementId":"([^"]+)"/);
    expect(agreementIdMatch).not.toBeNull();
    const agreementId = agreementIdMatch![1];

    const agreementCard = page.locator('.agreement-card').filter({ hasText: agreementId });
    await expect(agreementCard).toBeVisible({ timeout: 15_000 });

    await signOut(page);

    await signInWithDemoAccount(page, 'Partner');
    await agreementCard.getByRole('button', { name: 'Approve' }).click();
    await expect(agreementCard.locator('.status-pill')).toHaveText('APPROVED', { timeout: 15_000 });

    await signOut(page);

    await signInWithDemoAccount(page, 'Merchant');
    await agreementCard.getByRole('button', { name: 'Fund' }).click();
    await expect(agreementCard.locator('.status-pill')).toHaveText('FUNDED', { timeout: 15_000 });
});
