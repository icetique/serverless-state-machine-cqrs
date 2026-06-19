import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgresOutboxRepository } from '../../src/outbox/outbox-repository';
import { type TransactionalQueryable } from '../../src/lambda-utils';

describe('PostgresOutboxRepository', () => {
    const queryMock = jest.fn();
    const client = {
        query: queryMock as unknown as TransactionalQueryable['query'],
        release: jest.fn(),
    } as any;
    const pool = {
        connect: jest.fn(),
    } as any;

    beforeEach(() => {
        queryMock.mockReset();
        (client.release as jest.Mock).mockReset();
        (pool.connect as jest.Mock).mockReset();
        pool.connect.mockResolvedValue(client);
    });

    it('claims pending events inside a transaction', async () => {
        client.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: 1,
                        event_source: 'serverless-state-machine-cqrs.agreements',
                        event_type: 'AgreementFunded',
                        payload: { agreementId: 'agr_123' },
                        attempt_count: 2,
                    },
                ],
            })
            .mockResolvedValueOnce({ rows: [] });

        const repository = new PostgresOutboxRepository(pool);
        const result = await repository.claimPendingEvents(10);

        expect(result).toEqual([
            {
                id: 1,
                eventSource: 'serverless-state-machine-cqrs.agreements',
                eventType: 'AgreementFunded',
                payload: { agreementId: 'agr_123' },
                attemptCount: 2,
            },
        ]);
        expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN', []);
        expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE outbox_events'), [10, 30]);
        expect(queryMock).toHaveBeenNthCalledWith(3, 'COMMIT', []);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('rolls back and releases the client when claiming fails', async () => {
        client.query
            .mockResolvedValueOnce({ rows: [] })
            .mockRejectedValueOnce(new Error('query failed'))
            .mockResolvedValueOnce({ rows: [] });

        const repository = new PostgresOutboxRepository(pool);

        await expect(repository.claimPendingEvents(5)).rejects.toThrow('query failed');
        expect(queryMock).toHaveBeenNthCalledWith(3, 'ROLLBACK', []);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('marks events as published', async () => {
        client.query.mockResolvedValue({ rows: [] });

        const repository = new PostgresOutboxRepository(pool);
        await repository.markPublished(42);

        expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("SET status = 'published'"), [42]);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('marks events as failed with a lease extension', async () => {
        client.query.mockResolvedValue({ rows: [] });

        const repository = new PostgresOutboxRepository(pool);
        await repository.markFailed(42, 'publish failed');

        expect(queryMock).toHaveBeenCalledWith(
            expect.stringContaining("SET\n                        status = 'failed'"),
            [42, 'publish failed', 30],
        );
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});
