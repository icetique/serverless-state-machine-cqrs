import { type Queryable } from './lambda-utils';
import type { AgreementStatus, EventStreamItem, ListEventStreamQuery } from '@serverless-state-machine-cqrs/domain';

export type DebugEventRecord = EventStreamItem & {
    id: number;
    streamVersion: number;
    requestId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
};

export interface EventStreamReadRepository {
    listEvents(query: ListEventStreamQuery): Promise<DebugEventRecord[]>;
}

interface EventStoreRow {
    id: number;
    stream_id: string;
    stream_version: number;
    event_type: string;
    payload: {
        agreementId: string;
        previousStatus: AgreementStatus | null;
        newStatus: AgreementStatus;
        merchantId?: string;
        partnerId?: string;
        amount?: number;
        transactionId?: string;
    };
    metadata: {
        actor_id: string;
        actor_type: string;
        request_id: string;
        idempotency_key: string;
    };
    occurred_at: string;
}

export class PostgresEventStreamReadRepository implements EventStreamReadRepository {
    constructor(private readonly pool: Queryable) {}

    async listEvents(query: ListEventStreamQuery): Promise<DebugEventRecord[]> {
        const values: unknown[] = [query.limit];
        const streamFilter = query.agreementId !== undefined ? `WHERE stream_id = $2` : '';

        if (query.agreementId !== undefined) {
            values.push(query.agreementId);
        }

        const result = await this.pool.query<EventStoreRow>(
            `
                SELECT
                    id,
                    stream_id,
                    stream_version,
                    event_type,
                    payload,
                    metadata,
                    occurred_at::text
                FROM event_store
                ${streamFilter}
                ORDER BY occurred_at DESC, id DESC
                LIMIT $1
            `,
            values,
        );

        return result.rows.map((row) => ({
            id: row.id,
            streamVersion: row.stream_version,
            agreementId: row.stream_id,
            eventType: row.event_type,
            previousStatus: row.payload.previousStatus ?? null,
            newStatus: row.payload.newStatus,
            actorId: row.metadata.actor_id,
            actorType: row.metadata.actor_type,
            requestId: row.metadata.request_id,
            idempotencyKey: row.metadata.idempotency_key,
            payload: row.payload as Record<string, unknown>,
            createdAt: row.occurred_at,
        }));
    }
}
