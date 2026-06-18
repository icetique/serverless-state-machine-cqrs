export interface OutboxEventRecord {
    id: number;
    eventSource: string;
    eventType: string;
    payload: unknown;
    attemptCount: number;
}

interface OutboxEventRow {
    id: number;
    event_source: string;
    event_type: string;
    payload: unknown;
    attempt_count: number;
}

interface QueryResult<Row> {
    rows: Row[];
}

export interface Queryable {
    query<Row>(text: string, values: unknown[]): Promise<QueryResult<Row>>;
}

export interface TransactionalQueryable extends Queryable {
    release(): void;
}

export interface OutboxPool {
    connect(): Promise<TransactionalQueryable>;
}

export interface OutboxRepository {
    claimPendingEvents(limit: number): Promise<OutboxEventRecord[]>;
    markPublished(id: number): Promise<void>;
    markFailed(id: number, errorMessage: string): Promise<void>;
}

const CLAIM_LEASE_SECONDS = 30;

const mapOutboxEventRecord = (row: OutboxEventRow): OutboxEventRecord => ({
    id: row.id,
    eventSource: row.event_source,
    eventType: row.event_type,
    payload: row.payload,
    attemptCount: row.attempt_count,
});

export class PostgresOutboxRepository implements OutboxRepository {
    constructor(private readonly pool: OutboxPool) {}

    async claimPendingEvents(limit: number): Promise<OutboxEventRecord[]> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN', []);

            const result = await client.query<OutboxEventRow>(
                `
                    UPDATE outbox_events
                    SET
                        attempt_count = attempt_count + 1,
                        available_at = current_timestamp + ($2 * interval '1 second'),
                        last_error = NULL
                    WHERE id IN (
                        SELECT id
                        FROM outbox_events
                        WHERE status IN ('pending', 'failed')
                          AND available_at <= current_timestamp
                        ORDER BY id
                        LIMIT $1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, event_source, event_type, payload, attempt_count
                `,
                [limit, CLAIM_LEASE_SECONDS],
            );

            await client.query('COMMIT', []);

            return result.rows.map(mapOutboxEventRecord);
        } catch (error) {
            await client.query('ROLLBACK', []);
            throw error;
        } finally {
            client.release();
        }
    }

    async markPublished(id: number): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query(
                `
                    UPDATE outbox_events
                    SET status = 'published', published_at = current_timestamp, last_error = NULL
                    WHERE id = $1
                `,
                [id],
            );
        } finally {
            client.release();
        }
    }

    async markFailed(id: number, errorMessage: string): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query(
                `
                    UPDATE outbox_events
                    SET
                        status = 'failed',
                        last_error = $2,
                        available_at = current_timestamp + ($3 * interval '1 second')
                    WHERE id = $1
                `,
                [id, errorMessage, CLAIM_LEASE_SECONDS],
            );
        } finally {
            client.release();
        }
    }
}
