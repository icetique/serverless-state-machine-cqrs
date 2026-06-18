import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { merchantIdentity } from './test-support/fixtures';
import { sessionWithClaims } from './test-support/session';

const supabaseMocks = vi.hoisted(() => ({
    configured: true,
}));

const useSupabaseSessionMock = vi.hoisted(() => vi.fn());

vi.mock('./auth/useSupabaseSession', () => ({
    useSupabaseSession: (...args: unknown[]) => useSupabaseSessionMock(...args),
}));

vi.mock('./auth/supabaseClient', () => ({
    get isSupabaseConfigured() {
        return supabaseMocks.configured;
    },
    get supabase() {
        return supabaseMocks.configured ? {} : null;
    },
}));

vi.mock('./auth/demoAccounts', () => ({
    demoAccounts: [],
}));

import App from './App';

const merchantSession = sessionWithClaims({
    sub: 'merchant-sub',
    app_role: 'merchant',
    merchant_id: 'merchant_1',
    email: 'merchant_1@example.com',
});

const baseSessionHook = {
    authError: null,
    authReady: true,
    email: '',
    identity: null as typeof merchantIdentity | null,
    isAuthenticating: false,
    isSigningOut: false,
    password: '',
    session: null as typeof merchantSession | null,
    setEmail: vi.fn(),
    setPassword: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
};

describe('App routing', () => {
    beforeEach(() => {
        supabaseMocks.configured = true;
        useSupabaseSessionMock.mockReturnValue({ ...baseSessionHook });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ agreements: [] }),
            }),
        );
    });

    it('shows neither login nor dashboard while auth is bootstrapping', () => {
        useSupabaseSessionMock.mockReturnValue({
            ...baseSessionHook,
            authReady: false,
        });

        render(<App />);

        expect(screen.queryByRole('textbox', { name: /email/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create agreement/i })).not.toBeInTheDocument();
    });

    it('shows config blocked panel when Supabase is not configured', () => {
        supabaseMocks.configured = false;
        useSupabaseSessionMock.mockReturnValue({
            ...baseSessionHook,
            authError: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY',
        });

        render(<App />);

        expect(screen.queryByRole('button', { name: /create agreement/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: /email/i })).not.toBeInTheDocument();
    });

    it('shows login form when session or identity is missing', () => {
        render(<App />);

        expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create agreement/i })).not.toBeInTheDocument();
    });

    it('shows merchant create form when authenticated', () => {
        useSupabaseSessionMock.mockReturnValue({
            ...baseSessionHook,
            identity: merchantIdentity,
            session: merchantSession,
        });

        render(<App />);

        expect(screen.getByRole('button', { name: /create agreement/i })).toBeEnabled();
        expect(screen.getByDisplayValue('merchant_1')).toHaveAttribute('readonly');
    });
});
