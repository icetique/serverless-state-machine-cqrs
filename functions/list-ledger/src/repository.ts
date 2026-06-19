import { type Queryable } from './lambda-utils';
import type { LedgerEntryView } from '@serverless-state-machine-cqrs/domain';

export interface LedgerReadRepository {
    listEntries(limit: number): Promise<LedgerEntryView[]>;
}

interface LedgerEntryRow {
    transaction_id: string;
    agreement_id: string;
    amount: string;
    entry_type: string;
    created_at: string;
}

export class PostgresLedgerReadRepository implements LedgerReadRepository {
    constructor(private readonly pool: Queryable) {}

    async listEntries(limit: number): Promise<LedgerEntryView[]> {
        const result = await this.pool.query<LedgerEntryRow>(
            `
                SELECT
                    transaction_id,
                    agreement_id,
                    amount,
                    entry_type,
                    created_at::text
                FROM ledger_read_model
                ORDER BY id DESC
                LIMIT $1
            `,
            [limit],
        );

        return result.rows.map((row) => ({
            transactionId: row.transaction_id,
            agreementId: row.agreement_id,
            amount: Number(row.amount),
            entryType: row.entry_type,
            createdAt: row.created_at,
        }));
    }
}
