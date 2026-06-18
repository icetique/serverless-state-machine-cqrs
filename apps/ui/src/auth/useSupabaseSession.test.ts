import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSupabaseSession } from './useSupabaseSession';
import { sessionWithClaims } from '../test-support/session';

const merchantSession = sessionWithClaims({
    sub: 'merchant-sub',
    app_role: 'merchant',
    merchant_id: 'merchant_1',
    email: 'merchant_1@example.com',
});

const createMockClient = (
    options: {
        initialSession?: ReturnType<typeof sessionWithClaims> | null;
        getSessionError?: { message: string } | null;
        signInError?: { message: string } | null;
    } = {},
): SupabaseClient => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const signInWithPassword = vi.fn().mockResolvedValue({
        error: options.signInError ?? null,
    });

    return {
        auth: {
            getSession: vi.fn().mockResolvedValue({
                data: { session: options.initialSession ?? null },
                error: options.getSessionError ?? null,
            }),
            onAuthStateChange: vi.fn(() => ({
                data: { subscription: { unsubscribe: vi.fn() } },
            })),
            signInWithPassword,
            signOut,
        },
    } as unknown as SupabaseClient;
};

describe('useSupabaseSession', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('sets authError when client is null', async () => {
        const { result } = renderHook(() => useSupabaseSession(null));

        await waitFor(() => {
            expect(result.current.authReady).toBe(true);
        });

        expect(result.current.authError).toContain('VITE_SUPABASE');
        expect(result.current.identity).toBeNull();
    });

    it('sets identity when session has valid claims', async () => {
        const client = createMockClient({ initialSession: merchantSession });

        const { result } = renderHook(() => useSupabaseSession(client));

        await waitFor(() => {
            expect(result.current.identity?.role).toBe('merchant');
        });

        expect(result.current.authError).toBeNull();
        expect(result.current.session).toBe(merchantSession);
    });

    it('clears session and signs out when app_role is missing', async () => {
        const invalidSession = sessionWithClaims({ sub: 'user-1' });
        const client = createMockClient({ initialSession: invalidSession });

        const { result } = renderHook(() => useSupabaseSession(client));

        await waitFor(() => {
            expect(result.current.authError).toMatch(/app_role/i);
        });

        expect(result.current.identity).toBeNull();
        expect(result.current.session).toBeNull();
        expect(client.auth.signOut).toHaveBeenCalled();
    });

    it('sets authError on signIn failure without asserting exact Supabase copy', async () => {
        const client = createMockClient({
            signInError: { message: 'Invalid login credentials' },
        });

        const { result } = renderHook(() => useSupabaseSession(client));

        await waitFor(() => {
            expect(result.current.authReady).toBe(true);
        });

        act(() => {
            result.current.setEmail('merchant_1@example.com');
            result.current.setPassword('wrong');
        });

        await act(async () => {
            await result.current.signIn();
        });

        expect(result.current.authError).toBeTruthy();
        expect(result.current.isAuthenticating).toBe(false);
    });
});
