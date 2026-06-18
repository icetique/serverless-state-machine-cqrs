import { describe, expect, it, jest } from '@jest/globals';
import { PostgresLedgerRepository, Queryable } from '../../src/repository';

describe('PostgresLedgerRepository', () => {
    it('maps ledger rows', async () => {
        const queryMock: Queryable['query'] = async <Row>() => ({
            rows: [
                {
                    transaction_id: 'txn_123',
                    agreement_id: 'agr_123',
                    amount: '1000',
                    entry_type: 'settlement',
                    created_at: '2026-06-04T12:00:00.000Z',
                } as unknown as Row,
            ],
        });
        const query = jest.fn(queryMock as (...args: unknown[]) => unknown);
        const pool: Queryable = {
            query: ((text, values) => query(text, values)) as Queryable['query'],
        };

        const result = await new PostgresLedgerRepository(pool).listEntries(10);

        expect(query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY ledger_entries.id DESC'), [10]);
        expect(result).toEqual([
            {
                transactionId: 'txn_123',
                agreementId: 'agr_123',
                amount: 1000,
                entryType: 'settlement',
                createdAt: '2026-06-04T12:00:00.000Z',
            },
        ]);
    });
});
