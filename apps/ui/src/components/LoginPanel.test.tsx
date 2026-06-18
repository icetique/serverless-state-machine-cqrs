import { LoginPanel } from './LoginPanel';
import type { DemoAccount } from '../types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const demoAccounts: DemoAccount[] = [
    {
        label: 'Merchant',
        email: 'merchant_1@example.com',
        password: 'demo-password',
    },
    {
        label: 'Partner',
        email: 'partner_2@example.com',
        password: 'demo-password',
    },
];

const defaults = {
    authError: null,
    demoAccounts: [] as DemoAccount[],
    email: '',
    isAuthenticating: false,
    onEmailChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onPrefillDemoAccount: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    password: '',
};

describe('LoginPanel', () => {
    it('shows demo prefill buttons only when demo accounts exist', () => {
        const { rerender } = render(<LoginPanel {...defaults} />);

        expect(screen.queryAllByRole('button', { name: 'Prefill' })).toHaveLength(0);

        rerender(<LoginPanel {...defaults} demoAccounts={demoAccounts} />);

        expect(screen.getAllByRole('button', { name: 'Prefill' })).toHaveLength(demoAccounts.length);
    });

    it('invokes onPrefillDemoAccount with the selected account', () => {
        const onPrefillDemoAccount = vi.fn();

        render(<LoginPanel {...defaults} demoAccounts={demoAccounts} onPrefillDemoAccount={onPrefillDemoAccount} />);

        fireEvent.click(screen.getAllByRole('button', { name: 'Prefill' })[0]);

        expect(onPrefillDemoAccount).toHaveBeenCalledWith(demoAccounts[0]);
    });

    it('invokes onSubmit when the form is submitted', () => {
        const onSubmit = vi.fn((event) => event.preventDefault());

        render(<LoginPanel {...defaults} onSubmit={onSubmit} />);

        fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }).closest('form')!);

        expect(onSubmit).toHaveBeenCalled();
    });

    it('disables sign-in while authenticating', () => {
        render(<LoginPanel {...defaults} isAuthenticating />);

        expect(screen.getByRole('button', { name: /sign/i })).toBeDisabled();
    });

    it('renders authError in the error region', () => {
        const { container } = render(<LoginPanel {...defaults} authError="JWT is missing app_role claim" />);

        const errorRegion = container.querySelector('.response.error');

        expect(errorRegion).toBeTruthy();
        expect(errorRegion?.textContent).toMatch(/app_role/i);
    });
});
