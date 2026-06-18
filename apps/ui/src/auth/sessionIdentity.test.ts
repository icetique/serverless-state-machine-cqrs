import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { formatSessionIdentityError, getSessionIdentity, getSessionIdentityResult } from './sessionIdentity';
import { sessionWithClaims } from '../test-support/session';
describe('getSessionIdentityResult', () => {
    it('returns merchant identity when claims are valid', () => {
        expect(
            getSessionIdentityResult(
                sessionWithClaims({
                    sub: 'user-1',
                    app_role: 'merchant',
                    merchant_id: 'merchant_1',
                    email: 'merchant_1@example.com',
                }),
            ),
        ).toEqual({
            ok: true,
            identity: {
                subject: 'user-1',
                role: 'merchant',
                merchantId: 'merchant_1',
                email: 'merchant_1@example.com',
            },
        });
    });

    it('returns partner identity when claims are valid', () => {
        expect(
            getSessionIdentityResult(
                sessionWithClaims({
                    sub: 'user-2',
                    app_role: 'partner',
                    partner_id: 'partner_2',
                }),
            ),
        ).toEqual({
            ok: true,
            identity: {
                subject: 'user-2',
                role: 'partner',
                partnerId: 'partner_2',
                email: 'user@example.com',
            },
        });
    });

    it('returns admin identity when claims are valid', () => {
        expect(
            getSessionIdentityResult(
                sessionWithClaims({
                    sub: 'user-3',
                    app_role: 'admin',
                }),
            ),
        ).toEqual({
            ok: true,
            identity: {
                subject: 'user-3',
                role: 'admin',
                email: 'user@example.com',
            },
        });
    });

    it('fails when app_role is missing', () => {
        expect(getSessionIdentityResult(sessionWithClaims({ sub: 'user-1' }))).toEqual({
            ok: false,
            reason: 'missing_app_role',
        });
    });

    it('fails when app_role is invalid', () => {
        expect(
            getSessionIdentityResult(
                sessionWithClaims({
                    sub: 'user-1',
                    app_role: 'auditor',
                }),
            ),
        ).toEqual({
            ok: false,
            reason: 'invalid_app_role',
        });
    });

    it('fails when merchant_id is missing for merchants', () => {
        expect(
            getSessionIdentityResult(
                sessionWithClaims({
                    sub: 'user-1',
                    app_role: 'merchant',
                }),
            ),
        ).toEqual({
            ok: false,
            reason: 'missing_merchant_id',
        });
    });

    it('fails when partner_id is missing for partners', () => {
        expect(
            getSessionIdentityResult(
                sessionWithClaims({
                    sub: 'user-1',
                    app_role: 'partner',
                }),
            ),
        ).toEqual({
            ok: false,
            reason: 'missing_partner_id',
        });
    });

    it('fails when the token payload cannot be decoded', () => {
        expect(
            getSessionIdentityResult({
                access_token: 'not-a-jwt',
                user: { email: 'user@example.com' },
            } as Session),
        ).toEqual({
            ok: false,
            reason: 'invalid_token',
        });
    });
});

describe('getSessionIdentity', () => {
    it('returns null for invalid claims', () => {
        expect(getSessionIdentity(sessionWithClaims({ sub: 'user-1' }))).toBeNull();
    });
});

describe('formatSessionIdentityError', () => {
    it('mentions supabase setup for missing app_role', () => {
        expect(formatSessionIdentityError('missing_app_role')).toContain('docs/supabase-setup.md');
    });
});
