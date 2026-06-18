export interface LedgerEntry {
    transactionId: string;
    agreementId: string;
    amount: number;
    entryType: string;
    createdAt: string;
}

export interface LedgerRepository {
    listEntries(limit: number): Promise<LedgerEntry[]>;
}

interface QueryResult<Row> {
    rows: Row[];
}

export interface Queryable {
    query<Row>(text: string, values: unknown[]): Promise<QueryResult<Row>>;
}

interface LedgerEntryRow {
    transaction_id: string;
    agreement_id: string;
    amount: string;
    entry_type: string;
    created_at: string;
}

export class PostgresLedgerRepository implements LedgerRepository {
    constructor(private readonly pool: Queryable) {}

    async listEntries(limit: number): Promise<LedgerEntry[]> {
        const result = await this.pool.query<LedgerEntryRow>(
            `
                SELECT
                    ledger_entries.transaction_id,
                    agreements.public_id AS agreement_id,
                    ledger_entries.amount,
                    ledger_entries.entry_type,
                    ledger_entries.created_at::text
                FROM ledger_entries
                INNER JOIN agreements ON agreements.id = ledger_entries.agreement_id
                ORDER BY ledger_entries.id DESC
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
