import { describe, expect, it, jest } from '@jest/globals';
import { PostgresAgreementRepository, TransactionPool, TransactionalQueryable } from '../../src/repository';

describe('PostgresAgreementRepository transition', () => {
    it('updates status and writes audit/idempotency rows', async () => {
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

        const result = await new PostgresAgreementRepository(pool).transitionAgreement({
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
            eventPayload: {
                agreementId: 'agr_123',
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
                amount: 1000,
                previousStatus: 'CREATED',
                newStatus: 'APPROVED',
            },
            responseStatusCode: 200,
            responseBody:
                '{"agreementId":"agr_123","merchantId":"merchant_1","partnerId":"partner_2","amount":1000,"previousStatus":"CREATED","newStatus":"APPROVED"}',
        });
        expect(query.mock.calls[3][0]).toEqual(expect.stringContaining('UPDATE agreements'));
        expect(query.mock.calls[6][0]).toEqual(expect.stringContaining('INSERT INTO outbox_events'));
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

        const result = await new PostgresAgreementRepository(pool).settleAgreement({
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
        expect(result.responseBody).toContain('"transactionId":"txn_');
        expect(query.mock.calls.some(([text]) => text.includes('INSERT INTO ledger_entries'))).toBe(true);
        expect(query.mock.calls.some(([text]) => text.includes('INSERT INTO outbox_events'))).toBe(true);
    });
});
