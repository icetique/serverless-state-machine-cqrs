import { describe, expect, it } from '@jest/globals';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { getIdempotencyKey, ValidationError } from '@payments-example/lambda-utils';

const eventWithHeaders = (headers: Record<string, string | undefined>): APIGatewayProxyEventV2WithJWTAuthorizer =>
    ({
        headers,
    }) as APIGatewayProxyEventV2WithJWTAuthorizer;

describe('getIdempotencyKey', () => {
    it('reads Idempotency-Key header', () => {
        expect(getIdempotencyKey(eventWithHeaders({ 'Idempotency-Key': 'key-123' }))).toBe('key-123');
    });

    it('reads lowercase idempotency-key header', () => {
        expect(getIdempotencyKey(eventWithHeaders({ 'idempotency-key': 'key-456' }))).toBe('key-456');
    });

    it('throws ValidationError when header is missing', () => {
        expect(() => getIdempotencyKey(eventWithHeaders({}))).toThrow(ValidationError);
        expect(() => getIdempotencyKey(eventWithHeaders({}))).toThrow('Idempotency-Key header is required');
    });

    it('throws ValidationError when header is blank', () => {
        expect(() => getIdempotencyKey(eventWithHeaders({ 'Idempotency-Key': '   ' }))).toThrow(ValidationError);
    });
});
