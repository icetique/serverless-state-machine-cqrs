import { describe, expect, it, jest } from '@jest/globals';
import { PostgresDebugEventsRepository, Queryable } from '../../src/repository';

describe('PostgresDebugEventsRepository', () => {
    it('maps debug event rows', async () => {
        const queryMock: Queryable['query'] = async <Row>() => ({
            rows: [
                {
                    id: 1,
                    agreement_id: 'agr_123',
                    event_type: 'AgreementCreated',
                    previous_status: null,
                    new_status: 'CREATED',
                    request_id: 'req_1',
                    idempotency_key: 'idem_1',
                    payload: { agreementId: 'agr_123' },
                    created_at: '2026-06-04T11:00:00.000Z',
                } as unknown as Row,
            ],
        });
        const query = jest.fn(queryMock as (...args: unknown[]) => unknown);
        const pool: Queryable = {
            query: ((text, values) => query(text, values)) as Queryable['query'],
        };

        const repository = new PostgresDebugEventsRepository(pool);
        const result = await repository.listEvents({ limit: 25, agreementId: 'agr_123' });

        expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM agreement_events'), [25, 'agr_123']);
        expect(result).toEqual([
            {
                id: 1,
                agreementId: 'agr_123',
                eventType: 'AgreementCreated',
                previousStatus: null,
                newStatus: 'CREATED',
                requestId: 'req_1',
                idempotencyKey: 'idem_1',
                payload: { agreementId: 'agr_123' },
                createdAt: '2026-06-04T11:00:00.000Z',
            },
        ]);
    });
});
