import { useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { SessionIdentity } from '../../../../shared/auth-contract';
import { formatSessionIdentityError, getSessionIdentityResult } from './sessionIdentity';

type UseSupabaseSessionResult = {
    authError: string | null;
    authReady: boolean;
    email: string;
    identity: SessionIdentity | null;
    isAuthenticating: boolean;
    isSigningOut: boolean;
    password: string;
    session: Session | null;
    setEmail: (value: string) => void;
    setPassword: (value: string) => void;
    signIn: () => Promise<void>;
    signOut: (onAfterSignOut?: () => void) => Promise<void>;
};

export const useSupabaseSession = (client: SupabaseClient | null): UseSupabaseSessionResult => {
    const [session, setSession] = useState<Session | null>(null);
    const [identity, setIdentity] = useState<SessionIdentity | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);

    useEffect(() => {
        if (!client) {
            setAuthError('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
            setAuthReady(true);
            return;
        }

        let isMounted = true;

        const applySession = (nextSession: Session | null): void => {
            if (!nextSession) {
                setSession(null);
                setIdentity(null);
                return;
            }

            const result = getSessionIdentityResult(nextSession);

            if (result.ok) {
                setSession(nextSession);
                setIdentity(result.identity);
                setAuthError(null);
                return;
            }

            setSession(null);
            setIdentity(null);
            setAuthError(formatSessionIdentityError(result.reason));
            void client.auth.signOut();
        };

        void client.auth.getSession().then(({ data, error: sessionError }) => {
            if (!isMounted) {
                return;
            }

            if (sessionError) {
                setAuthError(sessionError.message);
            } else {
                applySession(data.session);
            }

            setAuthReady(true);
        });

        const {
            data: { subscription },
        } = client.auth.onAuthStateChange((_event, nextSession) => {
            applySession(nextSession);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [client]);

    const signIn = async (): Promise<void> => {
        if (!client) {
            setAuthError('Supabase client is not configured');
            return;
        }

        setIsAuthenticating(true);
        setAuthError(null);

        try {
            const { error: signInError } = await client.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                throw signInError;
            }
        } catch (caughtError) {
            setAuthError(caughtError instanceof Error ? caughtError.message : 'Failed to sign in');
        } finally {
            setIsAuthenticating(false);
        }
    };

    const signOut = async (onAfterSignOut?: () => void): Promise<void> => {
        if (!client) {
            return;
        }

        setIsSigningOut(true);
        setAuthError(null);

        try {
            const { error: signOutError } = await client.auth.signOut();

            if (signOutError) {
                throw signOutError;
            }

            onAfterSignOut?.();
        } catch (caughtError) {
            setAuthError(caughtError instanceof Error ? caughtError.message : 'Failed to sign out');
        } finally {
            setIsSigningOut(false);
        }
    };

    return {
        authError,
        authReady,
        email,
        identity,
        isAuthenticating,
        isSigningOut,
        password,
        session,
        setEmail,
        setPassword,
        signIn,
        signOut,
    };
};
