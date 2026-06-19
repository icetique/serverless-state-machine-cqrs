import { describe, expect, it, jest } from '@jest/globals';
import { PostgresAgreementCommandRepository } from '../../src/agreement-command-repository';
import type { TransactionPool, TransactionalQueryable } from '@serverless-state-machine-cqrs/lambda-utils';

describe('PostgresAgreementCommandRepository', () => {
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

        const repository = new PostgresAgreementCommandRepository(pool);
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

        const repository = new PostgresAgreementCommandRepository(pool);
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
            agreement: {
                agreementId: 'agr_123',
                status: 'CREATED',
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
                amount: 1000,
            },
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

        const repository = new PostgresAgreementCommandRepository(pool);
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

    it('updates status and writes audit/idempotency rows on transition', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }
            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }
            if (text.includes('SELECT id, public_id, status')) {
                return {
                    rows: [
                        {
                            id: 1,
                            public_id: 'agr_123',
                            status: 'CREATED',
                            merchant_id: 'merchant_1',
                            partner_id: 'partner_2',
                            amount: '1000',
                        },
                    ],
                };
            }
            if (text.includes('UPDATE agreements')) {
                return {
                    rows: [
                        {
                            id: 1,
                            public_id: 'agr_123',
                            status: 'APPROVED',
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

        const result = await new PostgresAgreementCommandRepository(pool).transitionAgreement({
            agreementId: 'agr_123',
            expectedCurrentStatus: 'CREATED',
            nextStatus: 'APPROVED',
            eventType: 'AgreementApproved',
            idempotencyKey: 'idem_1',
            requestHash: 'hash_1',
            requestId: 'req_1',
            actorId: 'api_gateway',
            actorType: 'partner',
        });

        expect(result).toEqual({
            kind: 'transitioned',
            payload: {
                agreementId: 'agr_123',
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
                amount: 1000,
                previousStatus: 'CREATED',
                newStatus: 'APPROVED',
            },
        });
        expect(query.mock.calls[3][0]).toEqual(expect.stringContaining('UPDATE agreements'));
        expect(query.mock.calls[6][0]).toEqual(expect.stringContaining('INSERT INTO outbox_events'));
    });

    it('rejects invalid transition via domain state machine', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }
            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }
            if (text.includes('SELECT id, public_id, status')) {
                return {
                    rows: [
                        {
                            id: 1,
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

        const result = await new PostgresAgreementCommandRepository(pool).transitionAgreement({
            agreementId: 'agr_123',
            expectedCurrentStatus: 'APPROVED',
            nextStatus: 'FUNDED',
            eventType: 'AgreementFunded',
            idempotencyKey: 'idem_1',
            requestHash: 'hash_1',
            requestId: 'req_1',
            actorId: 'api_gateway',
            actorType: 'merchant',
        });

        expect(result).toEqual({ kind: 'invalid_transition', currentStatus: 'CREATED' });
    });

    it('creates a ledger entry and returns transactionId for settlement', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }
            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }
            if (text.includes('SELECT id, public_id, status')) {
                return {
                    rows: [
                        {
                            id: 1,
                            public_id: 'agr_123',
                            status: 'FUNDED',
                            merchant_id: 'merchant_1',
                            partner_id: 'partner_2',
                            amount: '1000',
                        },
                    ],
                };
            }
            if (text.includes('UPDATE agreements')) {
                return {
                    rows: [
                        {
                            id: 1,
                            public_id: 'agr_123',
                            status: 'SETTLED',
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

        const result = await new PostgresAgreementCommandRepository(pool).settleAgreement({
            agreementId: 'agr_123',
            idempotencyKey: 'idem_1',
            requestHash: 'hash_1',
            requestId: 'req_1',
            actorId: 'api_gateway',
            actorType: 'merchant',
            triggerSource: 'http_manual',
        });

        expect(result.kind).toBe('transitioned');
        if (result.kind !== 'transitioned') {
            throw new Error('Expected settlement transition');
        }
        expect(result.payload.transactionId).toMatch(/^txn_/);
        expect(query.mock.calls.some(([text]) => text.includes('INSERT INTO ledger_entries'))).toBe(true);
        expect(query.mock.calls.some(([text]) => text.includes('INSERT INTO outbox_events'))).toBe(true);
    });

    it('rejects settlement when agreement is not FUNDED', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }
            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }
            if (text.includes('SELECT id, public_id, status')) {
                return {
                    rows: [
                        {
                            id: 1,
                            public_id: 'agr_123',
                            status: 'APPROVED',
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

        const result = await new PostgresAgreementCommandRepository(pool).settleAgreement({
            agreementId: 'agr_123',
            idempotencyKey: 'idem_1',
            requestHash: 'hash_1',
            requestId: 'req_1',
            actorId: 'api_gateway',
            actorType: 'merchant',
            triggerSource: 'http_manual',
        });

        expect(result).toEqual({ kind: 'invalid_transition', currentStatus: 'APPROVED' });
    });
});
