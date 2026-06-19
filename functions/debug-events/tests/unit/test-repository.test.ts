import { describe, expect, it, jest } from '@jest/globals';
import { PostgresEventStreamReadRepository } from '../../src/repository';
import { type Queryable } from '../../src/lambda-utils';

describe('PostgresEventStreamReadRepository', () => {
    it('maps event_store rows', async () => {
        const queryMock: Queryable['query'] = async <Row>() => ({
            rows: [
                {
                    id: 1,
                    stream_id: 'agr_123',
                    stream_version: 1,
                    event_type: 'AgreementCreated',
                    payload: {
                        agreementId: 'agr_123',
                        previousStatus: null,
                        newStatus: 'CREATED',
                    },
                    metadata: {
                        actor_id: 'merchant_1',
                        actor_type: 'merchant',
                        request_id: 'req_1',
                        idempotency_key: 'idem_1',
                    },
                    occurred_at: '2026-06-04T11:00:00.000Z',
                } as unknown as Row,
            ],
        });
        const query = jest.fn(queryMock as (...args: unknown[]) => unknown);
        const pool: Queryable = {
            query: ((text, values) => query(text, values)) as Queryable['query'],
        };

        const repository = new PostgresEventStreamReadRepository(pool);
        const result = await repository.listEvents({ limit: 25, agreementId: 'agr_123' });

        expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM event_store'), [25, 'agr_123']);
        expect(result).toEqual([
            {
                id: 1,
                streamVersion: 1,
                agreementId: 'agr_123',
                eventType: 'AgreementCreated',
                previousStatus: null,
                newStatus: 'CREATED',
                actorId: 'merchant_1',
                actorType: 'merchant',
                requestId: 'req_1',
                idempotencyKey: 'idem_1',
                payload: {
                    agreementId: 'agr_123',
                    previousStatus: null,
                    newStatus: 'CREATED',
                },
                createdAt: '2026-06-04T11:00:00.000Z',
            },
        ]);
    });
});
