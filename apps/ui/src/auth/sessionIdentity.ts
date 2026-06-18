import type { Session } from '@supabase/supabase-js';
import type { AuthRole, SessionIdentity, SupabaseJwtClaims } from '../../../../shared/auth-contract';

export type SessionIdentityFailureReason =
    | 'invalid_token'
    | 'missing_subject'
    | 'missing_app_role'
    | 'invalid_app_role'
    | 'missing_merchant_id'
    | 'missing_partner_id';

export type SessionIdentityResult =
    | { ok: true; identity: SessionIdentity }
    | { ok: false; reason: SessionIdentityFailureReason };

const VALID_ROLES: AuthRole[] = ['merchant', 'partner', 'admin'];

export const formatSessionIdentityError = (reason: SessionIdentityFailureReason): string => {
    switch (reason) {
        case 'invalid_token':
            return 'Signed in, but the access token could not be read. Sign out and try again.';
        case 'missing_subject':
            return 'Signed in, but the access token is missing a subject (sub). Check Supabase auth setup.';
        case 'missing_app_role':
            return 'Signed in, but the access token is missing app_role. Configure raw_app_meta_data and custom_access_token_hook (see docs/supabase-setup.md), then sign in again.';
        case 'invalid_app_role':
            return 'Signed in, but app_role is not merchant, partner, or admin. Check Supabase user metadata.';
        case 'missing_merchant_id':
            return 'Signed in as a merchant, but merchant_id is missing from the access token. Check Supabase raw_app_meta_data and the access token hook.';
        case 'missing_partner_id':
            return 'Signed in as a partner, but partner_id is missing from the access token. Check Supabase raw_app_meta_data and the access token hook.';
    }
};

const decodeJwtClaims = (token: string): SupabaseJwtClaims | null => {
    const [, payload] = token.split('.');

    if (!payload) {
        return null;
    }

    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const decoded = atob(padded);
        const utf8 = decodeURIComponent(
            Array.from(decoded)
                .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
                .join(''),
        );
        return JSON.parse(utf8) as SupabaseJwtClaims;
    } catch {
        return null;
    }
};

export const getSessionIdentityResult = (session: Session): SessionIdentityResult => {
    const claims = decodeJwtClaims(session.access_token);

    if (!claims) {
        return { ok: false, reason: 'invalid_token' };
    }

    if (!claims.sub || claims.sub.trim() === '') {
        return { ok: false, reason: 'missing_subject' };
    }

    if (!claims.app_role) {
        return { ok: false, reason: 'missing_app_role' };
    }

    if (!VALID_ROLES.includes(claims.app_role)) {
        return { ok: false, reason: 'invalid_app_role' };
    }

    if (claims.app_role === 'merchant' && !claims.merchant_id) {
        return { ok: false, reason: 'missing_merchant_id' };
    }

    if (claims.app_role === 'partner' && !claims.partner_id) {
        return { ok: false, reason: 'missing_partner_id' };
    }

    return {
        ok: true,
        identity: {
            subject: claims.sub,
            role: claims.app_role,
            merchantId: claims.merchant_id,
            partnerId: claims.partner_id,
            email: claims.email ?? session.user.email,
        },
    };
};

export const getSessionIdentity = (session: Session): SessionIdentity | null => {
    const result = getSessionIdentityResult(session);
    return result.ok ? result.identity : null;
};

export const formatRoleLabel = (role: AuthRole): string => role.charAt(0).toUpperCase() + role.slice(1);

export const identitySummary = (identity: SessionIdentity): string => {
    if (identity.role === 'merchant') {
        return `merchantId=${identity.merchantId}`;
    }

    if (identity.role === 'partner') {
        return `partnerId=${identity.partnerId}`;
    }

    return 'read-only inspector';
};
