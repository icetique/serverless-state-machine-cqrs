import { describe, expect, it, jest } from '@jest/globals';
import { PostgresAgreementCommandRepository } from '../../src/agreement-command-repository';
import type { TransactionPool, TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';

const makePool = (query: (text: string, values: unknown[]) => Promise<{ rows: unknown[] }>): TransactionPool => {
    const client: TransactionalQueryable = {
        query: ((text, values) => query(text, values)) as TransactionalQueryable['query'],
        release: jest.fn(),
    };

    return {
        connect: jest.fn(async () => client),
    };
};

describe('PostgresAgreementCommandRepository', () => {
    it('creates agreement via event_store and projections', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }

            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }

            if (text.includes('FROM event_store')) {
                return { rows: [] };
            }

            return { rows: [] };
        });

        const repository = new PostgresAgreementCommandRepository(makePool(query));
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

        expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO event_store'))).toBe(true);
        expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO agreements_read_model'))).toBe(true);
        expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO outbox_events'))).toBe(true);
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
    });

    it('replays create when idempotency key matches', async () => {
        const query = jest.fn(async () => ({
            rows: [
                {
                    request_hash: 'hash_1',
                    response_status_code: 201,
                    response_body:
                        '{"agreementId":"agr_123","status":"CREATED","merchantId":"merchant_1","partnerId":"partner_2","amount":1000}',
                },
            ],
        }));

        const repository = new PostgresAgreementCommandRepository(makePool(query));
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

    it('transitions via event_store append', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }

            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }

            if (text.includes('agreements_read_model') && text.includes('FOR UPDATE')) {
                return { rows: [{ public_id: 'agr_123' }] };
            }

            if (text.includes('FROM event_store')) {
                return {
                    rows: [
                        {
                            stream_version: 1,
                            event_type: 'AgreementCreated',
                            payload: {
                                agreementId: 'agr_123',
                                merchantId: 'merchant_1',
                                partnerId: 'partner_2',
                                amount: 1000,
                                previousStatus: null,
                                newStatus: 'CREATED',
                            },
                            metadata: {},
                        },
                    ],
                };
            }

            return { rows: [] };
        });

        const repository = new PostgresAgreementCommandRepository(makePool(query));
        const result = await repository.transitionAgreement({
            agreementId: 'agr_123',
            eventType: 'AgreementApproved',
            idempotencyKey: 'idem_approve',
            requestHash: 'hash_approve',
            requestId: 'req_2',
            actorId: 'partner',
            actorType: 'partner',
            auth: { subject: 'partner-sub', role: 'partner', partnerId: 'partner_2' },
        });

        expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO event_store'))).toBe(true);
        expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE agreements_read_model'))).toBe(true);
        expect(result.kind).toBe('transitioned');
    });

    it('rejects invalid transition from replayed state', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }

            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }

            if (text.includes('agreements_read_model')) {
                return { rows: [{ public_id: 'agr_123' }] };
            }

            if (text.includes('FROM event_store')) {
                return {
                    rows: [
                        {
                            stream_version: 1,
                            event_type: 'AgreementCreated',
                            payload: {
                                agreementId: 'agr_123',
                                merchantId: 'merchant_1',
                                partnerId: 'partner_2',
                                amount: 1000,
                                previousStatus: null,
                                newStatus: 'CREATED',
                            },
                            metadata: {},
                        },
                    ],
                };
            }

            return { rows: [] };
        });

        const repository = new PostgresAgreementCommandRepository(makePool(query));
        const result = await repository.transitionAgreement({
            agreementId: 'agr_123',
            eventType: 'AgreementFunded',
            idempotencyKey: 'idem_fund',
            requestHash: 'hash_fund',
            requestId: 'req_3',
            actorId: 'merchant',
            actorType: 'merchant',
            auth: { subject: 'merchant-sub', role: 'merchant', merchantId: 'merchant_1' },
        });

        expect(result).toEqual({ kind: 'invalid_transition', currentStatus: 'CREATED' });
    });

    it('settles and projects ledger_read_model', async () => {
        const query = jest.fn(async (text: string, _values: unknown[]) => {
            if (text === 'BEGIN' || text === 'COMMIT') {
                return { rows: [] };
            }

            if (text.includes('FROM idempotency_keys')) {
                return { rows: [] };
            }

            if (text.includes('agreements_read_model')) {
                return { rows: [{ public_id: 'agr_123' }] };
            }

            if (text.includes('FROM event_store')) {
                return {
                    rows: [
                        {
                            stream_version: 1,
                            event_type: 'AgreementCreated',
                            payload: {
                                agreementId: 'agr_123',
                                merchantId: 'merchant_1',
                                partnerId: 'partner_2',
                                amount: 1000,
                                previousStatus: null,
                                newStatus: 'CREATED',
                            },
                            metadata: {},
                        },
                        {
                            stream_version: 2,
                            event_type: 'AgreementApproved',
                            payload: {
                                agreementId: 'agr_123',
                                merchantId: 'merchant_1',
                                partnerId: 'partner_2',
                                amount: 1000,
                                previousStatus: 'CREATED',
                                newStatus: 'APPROVED',
                            },
                            metadata: {},
                        },
                        {
                            stream_version: 3,
                            event_type: 'AgreementFunded',
                            payload: {
                                agreementId: 'agr_123',
                                merchantId: 'merchant_1',
                                partnerId: 'partner_2',
                                amount: 1000,
                                previousStatus: 'APPROVED',
                                newStatus: 'FUNDED',
                            },
                            metadata: {},
                        },
                    ],
                };
            }

            return { rows: [] };
        });

        const repository = new PostgresAgreementCommandRepository(makePool(query));
        const result = await repository.settleAgreement({
            agreementId: 'agr_123',
            transactionId: 'txn_integration_test',
            idempotencyKey: 'idem_settle',
            requestHash: 'hash_settle',
            requestId: 'req_4',
            actorId: 'system',
            actorType: 'system',
            triggerSource: 'sqs',
        });

        expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ledger_read_model'))).toBe(true);
        expect(result.kind).toBe('transitioned');
        if (result.kind === 'transitioned') {
            expect(result.payload.newStatus).toBe('SETTLED');
            expect(result.payload.transactionId).toBe('txn_integration_test');
        }
    });
});
