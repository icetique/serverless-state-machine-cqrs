import type { Session } from '@supabase/supabase-js';

export const toBase64Url = (value: string): string =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

export const createUnsignedJwt = (claims: Record<string, unknown>): string => {
    const header = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = toBase64Url(JSON.stringify(claims));

    return `${header}.${payload}.`;
};

export const sessionWithClaims = (claims: Record<string, unknown>, email = 'user@example.com'): Session =>
    ({
        access_token: createUnsignedJwt(claims),
        user: { email },
    }) as Session;
