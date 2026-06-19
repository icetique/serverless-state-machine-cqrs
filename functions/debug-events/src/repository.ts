import { type Queryable } from './lambda-utils';
import type { AgreementStatus, EventStreamItem, ListEventStreamQuery } from '@serverless-state-machine-cqrs/domain';

export type DebugEventRecord = EventStreamItem & {
    id: number;
    requestId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
};

export interface EventStreamReadRepository {
    listEvents(query: ListEventStreamQuery): Promise<DebugEventRecord[]>;
}

interface DebugEventRow {
    id: number;
    agreement_id: string;
    event_type: string;
    previous_status: string | null;
    new_status: string;
    actor_id: string;
    actor_type: string;
    request_id: string;
    idempotency_key: string;
    payload: Record<string, unknown>;
    created_at: string;
}

export class PostgresEventStreamReadRepository implements EventStreamReadRepository {
    constructor(private readonly pool: Queryable) {}

    async listEvents(query: ListEventStreamQuery): Promise<DebugEventRecord[]> {
        const values: unknown[] = [query.limit];
        const agreementFilter = query.agreementId !== undefined ? `WHERE agreements.public_id = $2` : '';

        if (query.agreementId !== undefined) {
            values.push(query.agreementId);
        }

        const result = await this.pool.query<DebugEventRow>(
            `
                SELECT
                    agreement_events.id,
                    agreements.public_id AS agreement_id,
                    agreement_events.event_type,
                    agreement_events.previous_status,
                    agreement_events.new_status,
                    agreement_events.actor_id,
                    agreement_events.actor_type,
                    agreement_events.request_id,
                    agreement_events.idempotency_key,
                    agreement_events.payload,
                    agreement_events.created_at::text
                FROM agreement_events
                INNER JOIN agreements ON agreements.id = agreement_events.agreement_id
                ${agreementFilter}
                ORDER BY agreement_events.created_at DESC
                LIMIT $1
            `,
            values,
        );

        return result.rows.map((row) => ({
            id: row.id,
            agreementId: row.agreement_id,
            eventType: row.event_type,
            previousStatus: row.previous_status as AgreementStatus | null,
            newStatus: row.new_status as AgreementStatus,
            actorId: row.actor_id,
            actorType: row.actor_type,
            requestId: row.request_id,
            idempotencyKey: row.idempotency_key,
            payload: row.payload,
            createdAt: row.created_at,
        }));
    }
}
