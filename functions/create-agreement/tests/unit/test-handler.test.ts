import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHandler } from '../../app';
import { AgreementRepository, CreateAgreementResult } from '../../src/repository';
import {
    TEST_JWT_CLAIMS,
    asJwtHandlerEvent,
    createHttpApiEvent,
    createUnsignedJwt,
} from '../../../../tests/fixtures/http-api/http-api';

const createEvent = (body: string | null, idempotencyKey?: string, claims = TEST_JWT_CLAIMS.merchant) =>
    createHttpApiEvent({
        body,
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        claims,
        requestId: 'req_123',
    });

const parseBody = (body: string | undefined) => JSON.parse(body ?? '{}');

describe('Create agreement handler', () => {
    const repository: jest.Mocked<AgreementRepository> = {
        createAgreement: jest.fn(),
    };

    beforeEach(() => {
        repository.createAgreement.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        delete process.env.AWS_SAM_LOCAL;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const createdResult: CreateAgreementResult = {
        kind: 'created',
        agreement: {
            agreementId: 'agr_123',
            status: 'CREATED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
        },
        eventPayload: {
            agreementId: 'agr_123',
            status: 'CREATED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
        },
        responseStatusCode: 201,
        responseBody:
            '{"agreementId":"agr_123","status":"CREATED","merchantId":"merchant_1","partnerId":"partner_2","amount":1000}',
    };

    it('returns 201 for a valid request', async () => {
        repository.createAgreement.mockResolvedValue(createdResult);

        const handler = createHandler(repository);
        const result = await handler(
            createEvent(JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 1000 }), 'idem_1'),
        );

        expect(result.statusCode).toBe(201);
        expect(parseBody(result.body)).toEqual({
            agreementId: 'agr_123',
            status: 'CREATED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
        });
        expect(repository.createAgreement).toHaveBeenCalledWith(
            expect.objectContaining({
                publicId: expect.stringMatching(/^agr_/),
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
                amount: 1000,
                idempotencyKey: 'idem_1',
                requestHash: expect.any(String),
                requestId: 'req_123',
                actorId: TEST_JWT_CLAIMS.merchant.sub,
                actorType: 'merchant',
            }),
        );
    });

    it('returns 400 for malformed json', async () => {
        const handler = createHandler(repository);
        const result = await handler(createEvent('{', 'idem_1'));

        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toEqual({ message: 'Request body must be valid JSON' });
    });

    it('returns 400 when Idempotency-Key is missing', async () => {
        const handler = createHandler(repository);
        const result = await handler(
            createEvent(JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 1000 })),
        );

        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toEqual({ message: 'Idempotency-Key header is required' });
    });

    it('returns 400 when merchantId is missing', async () => {
        const handler = createHandler(repository);
        const result = await handler(createEvent(JSON.stringify({ partnerId: 'partner_2', amount: 1000 }), 'idem_1'));

        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toEqual({ message: 'merchantId is required' });
    });

    it('returns 400 when partnerId is missing', async () => {
        const handler = createHandler(repository);
        const result = await handler(createEvent(JSON.stringify({ merchantId: 'merchant_1', amount: 1000 }), 'idem_1'));

        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toEqual({ message: 'partnerId is required' });
    });

    it('returns 400 when amount is missing', async () => {
        const handler = createHandler(repository);
        const result = await handler(
            createEvent(JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2' }), 'idem_1'),
        );

        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toEqual({ message: 'amount is required' });
    });

    it('returns 400 when amount is not positive', async () => {
        const handler = createHandler(repository);
        const result = await handler(
            createEvent(JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 0 }), 'idem_1'),
        );

        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toEqual({ message: 'amount must be greater than zero' });
    });

    it('returns 400 when merchantId and partnerId match', async () => {
        const handler = createHandler(repository);
        const result = await handler(
            createEvent(JSON.stringify({ merchantId: 'merchant_1', partnerId: 'merchant_1', amount: 1000 }), 'idem_1'),
        );

        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toEqual({ message: 'merchantId and partnerId must be different' });
    });

    it('returns 500 when repository insert fails', async () => {
        repository.createAgreement.mockRejectedValue(new Error('db down'));

        const handler = createHandler(repository);
        const result = await handler(
            createEvent(JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 1000 }), 'idem_1'),
        );

        expect(result.statusCode).toBe(500);
        expect(parseBody(result.body)).toEqual({ message: 'Internal server error' });
    });

    it('replays a stored response for the same idempotency key and payload', async () => {
        repository.createAgreement.mockResolvedValue({
            kind: 'replayed',
            responseStatusCode: 201,
            responseBody:
                '{"agreementId":"agr_123","status":"CREATED","merchantId":"merchant_1","partnerId":"partner_2","amount":1000}',
        });

        const handler = createHandler(repository);
        const result = await handler(
            createEvent(JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 1000 }), 'idem_1'),
        );

        expect(result.statusCode).toBe(201);
        expect(parseBody(result.body)).toEqual({
            agreementId: 'agr_123',
            status: 'CREATED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
        });
    });

    it('returns 409 for the same idempotency key with a different payload', async () => {
        repository.createAgreement.mockResolvedValue({ kind: 'conflict' });

        const handler = createHandler(repository);
        const result = await handler(
            createEvent(JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 1000 }), 'idem_1'),
        );

        expect(result.statusCode).toBe(409);
        expect(parseBody(result.body)).toEqual({ message: 'Idempotency-Key reuse with different payload' });
    });

    it('returns 401 when the authorization token is missing', async () => {
        const handler = createHandler(repository);
        const result = await handler(
            asJwtHandlerEvent(
                createHttpApiEvent({
                    body: JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 1000 }),
                    headers: { 'Idempotency-Key': 'idem_1' },
                    requestId: 'req_123',
                }),
            ),
        );

        expect(result.statusCode).toBe(401);
        expect(parseBody(result.body)).toEqual({ message: 'JWT authorizer claims are required' });
    });

    it('returns 403 when the caller is not a merchant', async () => {
        const handler = createHandler(repository);
        const result = await handler(
            createEvent(
                JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 1000 }),
                'idem_1',
                TEST_JWT_CLAIMS.partner,
            ),
        );

        expect(result.statusCode).toBe(403);
        expect(parseBody(result.body)).toEqual({ message: 'Only merchants may create agreements' });
    });

    it('returns 403 when a merchant tries to create for another merchant id', async () => {
        const handler = createHandler(repository);
        const result = await handler(
            createEvent(
                JSON.stringify({ merchantId: 'merchant_999', partnerId: 'partner_2', amount: 1000 }),
                'idem_1',
                TEST_JWT_CLAIMS.merchant,
            ),
        );

        expect(result.statusCode).toBe(403);
        expect(parseBody(result.body)).toEqual({ message: 'Merchants may only create their own agreements' });
    });

    it('accepts a bearer token fallback when authorizer claims are unavailable', async () => {
        repository.createAgreement.mockResolvedValue(createdResult);
        process.env.AWS_SAM_LOCAL = 'true';

        const handler = createHandler(repository);
        const result = await handler(
            asJwtHandlerEvent(
                createHttpApiEvent({
                    body: JSON.stringify({ merchantId: 'merchant_1', partnerId: 'partner_2', amount: 1000 }),
                    headers: {
                        'Idempotency-Key': 'idem_1',
                        Authorization: `Bearer ${createUnsignedJwt(TEST_JWT_CLAIMS.merchant)}`,
                    },
                    requestId: 'req_123',
                }),
            ),
        );

        expect(result.statusCode).toBe(201);
    });
});
