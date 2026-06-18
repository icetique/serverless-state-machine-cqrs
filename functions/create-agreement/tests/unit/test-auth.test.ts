import { afterEach, describe, expect, it } from '@jest/globals';
import {
    TEST_JWT_CLAIMS,
    asAuthContextEvent,
    createHttpApiEvent,
    createUnsignedJwt,
} from '../../../../tests/fixtures/http-api/http-api';
import { requireAuthContext } from '../../src/lambda-utils';

describe('Supabase JWT auth', () => {
    afterEach(() => {
        delete process.env.AWS_SAM_LOCAL;
    });

    it('builds auth context from merchant JWT claims', () => {
        expect(requireAuthContext(createHttpApiEvent({ claims: TEST_JWT_CLAIMS.merchant }))).toEqual({
            subject: 'supabase-user-merchant-1',
            role: 'merchant',
            merchantId: 'merchant_1',
        });
    });

    it('builds auth context from partner JWT claims', () => {
        expect(requireAuthContext(createHttpApiEvent({ claims: TEST_JWT_CLAIMS.partner }))).toEqual({
            subject: 'supabase-user-partner-2',
            role: 'partner',
            partnerId: 'partner_2',
        });
    });

    it('builds auth context from admin JWT claims', () => {
        expect(requireAuthContext(createHttpApiEvent({ claims: TEST_JWT_CLAIMS.admin }))).toEqual({
            subject: 'supabase-user-admin-1',
            role: 'admin',
        });
    });

    it('falls back to parsing bearer JWT when authorizer claims are absent', () => {
        process.env.AWS_SAM_LOCAL = 'true';

        expect(
            requireAuthContext(
                asAuthContextEvent(
                    createHttpApiEvent({
                        token: createUnsignedJwt(TEST_JWT_CLAIMS.merchant),
                    }),
                ),
            ),
        ).toEqual({
            subject: 'supabase-user-merchant-1',
            role: 'merchant',
            merchantId: 'merchant_1',
        });
    });

    it('throws when the authorization header is missing', () => {
        expect(() => requireAuthContext(asAuthContextEvent(createHttpApiEvent()))).toThrow(
            'JWT authorizer claims are required',
        );
    });

    it('throws when authorizer claims are missing outside sam local', () => {
        expect(() =>
            requireAuthContext(
                asAuthContextEvent(
                    createHttpApiEvent({
                        token: createUnsignedJwt(TEST_JWT_CLAIMS.merchant),
                    }),
                ),
            ),
        ).toThrow('JWT authorizer claims are required');
    });

    it('throws when the JWT payload is malformed', () => {
        process.env.AWS_SAM_LOCAL = 'true';

        expect(() => requireAuthContext(asAuthContextEvent(createHttpApiEvent({ token: 'not-a-jwt' })))).toThrow(
            'JWT bearer token format is invalid',
        );
    });

    it('throws when merchant claims omit merchant_id', () => {
        expect(() =>
            requireAuthContext(
                createHttpApiEvent({
                    claims: {
                        sub: 'supabase-user-merchant-1',
                        app_role: 'merchant',
                    },
                }),
            ),
        ).toThrow('JWT merchant_id claim is required for merchants');
    });
});
