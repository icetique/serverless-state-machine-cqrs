import { describe, expect, it } from 'vitest';
import { buildDemoAccounts } from './demoAccounts';

describe('buildDemoAccounts', () => {
    it('returns an empty list when demo env vars are missing', () => {
        expect(buildDemoAccounts({})).toEqual([]);
    });

    it('returns an empty list when only email or password is set', () => {
        expect(
            buildDemoAccounts({
                VITE_DEMO_MERCHANT_EMAIL: 'merchant_1@example.com',
            }),
        ).toEqual([]);
    });

    it('includes only accounts with both email and password configured', () => {
        expect(
            buildDemoAccounts({
                VITE_DEMO_MERCHANT_EMAIL: 'merchant_1@example.com',
                VITE_DEMO_MERCHANT_PASSWORD: 'merchant-password',
                VITE_DEMO_PARTNER_EMAIL: 'partner_2@example.com',
            }),
        ).toEqual([
            {
                label: 'Merchant',
                email: 'merchant_1@example.com',
                password: 'merchant-password',
            },
        ]);
    });

    it('trims whitespace from configured demo credentials', () => {
        expect(
            buildDemoAccounts({
                VITE_DEMO_ADMIN_EMAIL: ' admin_1@example.com ',
                VITE_DEMO_ADMIN_PASSWORD: ' admin-password ',
            }),
        ).toEqual([
            {
                label: 'Admin',
                email: 'admin_1@example.com',
                password: 'admin-password',
            },
        ]);
    });
});
