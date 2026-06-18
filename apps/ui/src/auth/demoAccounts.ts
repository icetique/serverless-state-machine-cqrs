import type { DemoAccount } from '../types';

type DemoAccountDefinition = {
    label: string;
    emailKey: string;
    passwordKey: string;
};

const demoAccountDefinitions: DemoAccountDefinition[] = [
    {
        label: 'Merchant',
        emailKey: 'VITE_DEMO_MERCHANT_EMAIL',
        passwordKey: 'VITE_DEMO_MERCHANT_PASSWORD',
    },
    {
        label: 'Partner',
        emailKey: 'VITE_DEMO_PARTNER_EMAIL',
        passwordKey: 'VITE_DEMO_PARTNER_PASSWORD',
    },
    {
        label: 'Admin',
        emailKey: 'VITE_DEMO_ADMIN_EMAIL',
        passwordKey: 'VITE_DEMO_ADMIN_PASSWORD',
    },
];

export function buildDemoAccounts(env: Record<string, string | undefined> = import.meta.env): DemoAccount[] {
    return demoAccountDefinitions.flatMap(({ label, emailKey, passwordKey }) => {
        const email = env[emailKey]?.trim();
        const password = env[passwordKey]?.trim();

        if (!email || !password) {
            return [];
        }

        return [{ label, email, password }];
    });
}

export const demoAccounts = buildDemoAccounts();
