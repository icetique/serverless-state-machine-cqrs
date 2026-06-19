import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHandler } from '../../app';
import { LedgerReadRepository } from '../../src/repository';
import { TEST_JWT_CLAIMS, createHttpApiEvent } from '../../../../tests/fixtures/http-api/http-api';

const createEvent = (queryStringParameters?: Record<string, string>, claims = TEST_JWT_CLAIMS.admin) =>
    createHttpApiEvent({
        queryStringParameters: queryStringParameters ?? null,
        claims,
    });

const parseBody = (body: string | undefined) => JSON.parse(body ?? '{}');

describe('List ledger handler', () => {
    const repository: jest.Mocked<LedgerReadRepository> = {
        listEntries: jest.fn(),
    };

    beforeEach(() => {
        repository.listEntries.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns ledger entries in the repository order', async () => {
        repository.listEntries.mockResolvedValue([
            {
                transactionId: 'txn_123',
                agreementId: 'agr_123',
                amount: 1000,
                entryType: 'settlement',
                createdAt: '2026-06-04T12:00:00.000Z',
            },
        ]);

        const result = await createHandler(repository)(createEvent({ limit: '10' }));

        expect(result.statusCode).toBe(200);
        expect(repository.listEntries).toHaveBeenCalledWith(10);
        expect(parseBody(result.body)).toEqual({
            entries: [
                {
                    transactionId: 'txn_123',
                    agreementId: 'agr_123',
                    amount: 1000,
                    entryType: 'settlement',
                    createdAt: '2026-06-04T12:00:00.000Z',
                },
            ],
        });
    });

    it('defaults limit to 50', async () => {
        repository.listEntries.mockResolvedValue([]);
        const result = await createHandler(repository)(createEvent());
        expect(result.statusCode).toBe(200);
        expect(repository.listEntries).toHaveBeenCalledWith(50);
    });

    it('returns 400 for invalid limit', async () => {
        const result = await createHandler(repository)(createEvent({ limit: '0' }));
        expect(result.statusCode).toBe(400);
    });

    it('returns 403 for non-admin callers', async () => {
        const result = await createHandler(repository)(createEvent(undefined, TEST_JWT_CLAIMS.partner));
        expect(result.statusCode).toBe(403);
        expect(parseBody(result.body)).toEqual({ message: 'Only admins may inspect ledger entries' });
    });
});
