import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHandler } from '../../app';
import { AgreementsRepository } from '../../src/repository';
import { TEST_JWT_CLAIMS, asJwtHandlerEvent, createHttpApiEvent } from '../../../../tests/fixtures/http-api/http-api';

const createEvent = (queryStringParameters?: Record<string, string>, claims = TEST_JWT_CLAIMS.admin) =>
    createHttpApiEvent({
        queryStringParameters: queryStringParameters ?? null,
        claims,
    });

const parseBody = (body: string | undefined) => JSON.parse(body ?? '{}');

describe('List agreements handler', () => {
    const repository: jest.Mocked<AgreementsRepository> = {
        listAgreements: jest.fn(),
    };

    beforeEach(() => {
        repository.listAgreements.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns agreements in the repository order', async () => {
        repository.listAgreements.mockResolvedValue([
            {
                agreementId: 'agr_123',
                status: 'CREATED',
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
                amount: 1000,
                createdAt: '2026-06-04T12:00:00.000Z',
            },
        ]);

        const result = await createHandler(repository)(createEvent({ limit: '10' }));

        expect(result.statusCode).toBe(200);
        expect(repository.listAgreements).toHaveBeenCalledWith({
            limit: 10,
            role: 'admin',
            merchantId: undefined,
            partnerId: undefined,
        });
        expect(parseBody(result.body)).toEqual({
            agreements: [
                {
                    agreementId: 'agr_123',
                    status: 'CREATED',
                    merchantId: 'merchant_1',
                    partnerId: 'partner_2',
                    amount: 1000,
                    createdAt: '2026-06-04T12:00:00.000Z',
                },
            ],
        });
    });

    it('defaults limit to 50', async () => {
        repository.listAgreements.mockResolvedValue([]);
        const result = await createHandler(repository)(createEvent());
        expect(result.statusCode).toBe(200);
        expect(repository.listAgreements).toHaveBeenCalledWith({
            limit: 50,
            role: 'admin',
            merchantId: undefined,
            partnerId: undefined,
        });
    });

    it('returns 400 for invalid limit', async () => {
        const result = await createHandler(repository)(createEvent({ limit: '0' }));
        expect(result.statusCode).toBe(400);
    });

    it('scopes merchant requests to their own agreements', async () => {
        repository.listAgreements.mockResolvedValue([]);
        const result = await createHandler(repository)(createEvent(undefined, TEST_JWT_CLAIMS.merchant));

        expect(result.statusCode).toBe(200);
        expect(repository.listAgreements).toHaveBeenCalledWith({
            limit: 50,
            role: 'merchant',
            merchantId: 'merchant_1',
            partnerId: undefined,
        });
    });

    it('returns 401 when the token is missing', async () => {
        const result = await createHandler(repository)(asJwtHandlerEvent(createHttpApiEvent()));
        expect(result.statusCode).toBe(401);
    });
});
