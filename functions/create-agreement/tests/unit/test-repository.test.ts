import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { PostgresAgreementRepository, TransactionPool, TransactionalQueryable } from '../../src/repository';
import { createPool, getDatabaseUrl } from '@payments-example/lambda-utils';

describe('getDatabaseUrl', () => {
    const prev = process.env.DATABASE_URL;

    afterEach(() => {
        if (prev === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = prev;
        }
    });

    it('returns the DATABASE_URL environment variable', () => {
        process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
        expect(getDatabaseUrl()).toBe('postgres://test:test@localhost:5432/test');
    });

    it('throws when DATABASE_URL is not set', () => {
        delete process.env.DATABASE_URL;
        expect(() => getDatabaseUrl()).toThrow('DATABASE_URL is required');
    });
});

describe('createPool', () => {
    it('creates a pool with the given connection string', () => {
        const pool = createPool('postgres://test:test@localhost:5432/test');
        expect(pool.totalCount).toBe(0);
        expect(typeof pool.query).toBe('function');
        pool.end();
    });
});

describe('PostgresAgreementRepository', () => {
    it('creates agreement, audit row, idempotency row, and outbox row in one transaction', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }

            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }

            if (text.includes('INSERT INTO agreements')) {
                return {
                    rows: [
                        {
                            id: 7,
                            public_id: 'agr_123',
                            status: 'CREATED',
                            merchant_id: 'merchant_1',
                            partner_id: 'partner_2',
                            amount: '1000',
                        },
                    ],
                };
            }

            return { rows: [] };
        });
        const client: TransactionalQueryable = {
            query: ((text, values) => query(text, values)) as TransactionalQueryable['query'],
            release: jest.fn(),
        };
        const pool: TransactionPool = {
            connect: jest.fn(async () => client),
        };

        const repository = new PostgresAgreementRepository(pool);
        const result = await repository.createAgreement({
            publicId: 'agr_123',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
            idempotencyKey: 'idem_1',
            requestHash: 'hash_1',
            requestId: 'req_1',
            actorId: 'api_gateway',
            actorType: 'merchant',
        });

        expect(pool.connect as jest.Mock).toHaveBeenCalled();
        expect(query.mock.calls[0]).toEqual(['BEGIN', []]);
        expect(query.mock.calls[2]).toEqual([
            expect.stringContaining('INSERT INTO agreements'),
            ['agr_123', 'merchant_1', 'partner_2', 1000],
        ]);
        expect(query.mock.calls[3][0]).toEqual(expect.stringContaining('INSERT INTO agreement_events'));
        expect(query.mock.calls[4][0]).toEqual(expect.stringContaining('INSERT INTO idempotency_keys'));
        expect(query.mock.calls[5][0]).toEqual(expect.stringContaining('INSERT INTO outbox_events'));
        expect(result).toEqual({
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
        });
        expect(client.release).toHaveBeenCalled();
    });

    it('replays the stored response when the idempotency key matches the same request hash', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }

            return {
                rows: [
                    {
                        request_hash: 'hash_1',
                        response_status_code: 201,
                        response_body:
                            '{"agreementId":"agr_123","status":"CREATED","merchantId":"merchant_1","partnerId":"partner_2","amount":1000}',
                    },
                ],
            };
        });
        const client: TransactionalQueryable = {
            query: ((text, values) => query(text, values)) as TransactionalQueryable['query'],
            release: jest.fn(),
        };
        const pool: TransactionPool = {
            connect: jest.fn(async () => client),
        };

        const repository = new PostgresAgreementRepository(pool);
        const result = await repository.createAgreement({
            publicId: 'agr_123',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
            idempotencyKey: 'idem_1',
            requestHash: 'hash_1',
            requestId: 'req_1',
            actorId: 'api_gateway',
            actorType: 'merchant',
        });

        expect(result).toEqual({
            kind: 'replayed',
            responseStatusCode: 201,
            responseBody:
                '{"agreementId":"agr_123","status":"CREATED","merchantId":"merchant_1","partnerId":"partner_2","amount":1000}',
        });
    });

    it('returns conflict when the idempotency key is reused with a different request hash', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }

            return {
                rows: [
                    {
                        request_hash: 'hash_1',
                        response_status_code: 201,
                        response_body: '{}',
                    },
                ],
            };
        });
        const client: TransactionalQueryable = {
            query: ((text, values) => query(text, values)) as TransactionalQueryable['query'],
            release: jest.fn(),
        };
        const pool: TransactionPool = {
            connect: jest.fn(async () => client),
        };

        const repository = new PostgresAgreementRepository(pool);
        const result = await repository.createAgreement({
            publicId: 'agr_123',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
            idempotencyKey: 'idem_1',
            requestHash: 'different_hash',
            requestId: 'req_1',
            actorId: 'api_gateway',
            actorType: 'merchant',
        });

        expect(result).toEqual({ kind: 'conflict' });
    });
});
