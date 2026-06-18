import { describe, expect, it } from 'vitest';
import { buildAuthHeaders } from './api';
import { sessionWithClaims } from '../test-support/session';

describe('buildAuthHeaders', () => {
    it('returns Bearer with empty token when session is null', () => {
        expect(buildAuthHeaders(null)).toEqual({
            Authorization: 'Bearer ',
        });
    });

    it('includes the access token when session is present', () => {
        const session = sessionWithClaims({ sub: 'user-1', app_role: 'admin' });

        expect(buildAuthHeaders(session)).toEqual({
            Authorization: `Bearer ${session.access_token}`,
        });
    });

    it('merges extra headers', () => {
        const session = sessionWithClaims({ sub: 'user-1' });

        expect(
            buildAuthHeaders(session, {
                'Idempotency-Key': 'key-1',
                'Content-Type': 'application/json',
            }),
        ).toEqual({
            Authorization: `Bearer ${session.access_token}`,
            'Idempotency-Key': 'key-1',
            'Content-Type': 'application/json',
        });
    });
});
