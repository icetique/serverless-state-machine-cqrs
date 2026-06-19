import type { AgreementEventType } from '@serverless-state-machine-cqrs/domain';
import type { TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';
import type { StreamEventRecord } from '@serverless-state-machine-cqrs/domain';

export interface EventStoreRow {
    stream_version: number;
    event_type: AgreementEventType;
    payload: StreamEventRecord['payload'];
    metadata: {
        actor_id: string;
        actor_type: string;
        request_id: string;
        idempotency_key: string;
    };
}

export const loadStreamEvents = async (
    client: TransactionalQueryable,
    streamId: string,
): Promise<StreamEventRecord[]> => {
    const result = await client.query<EventStoreRow>(
        `
            SELECT stream_version, event_type, payload, metadata
            FROM event_store
            WHERE stream_id = $1
            ORDER BY stream_version ASC
            FOR UPDATE
        `,
        [streamId],
    );

    return result.rows.map((row) => ({
        streamVersion: row.stream_version,
        eventType: row.event_type,
        payload: row.payload,
    }));
};

export const lockAgreementReadModel = async (client: TransactionalQueryable, streamId: string): Promise<boolean> => {
    const result = await client.query(
        `
            SELECT public_id
            FROM agreements_read_model
            WHERE public_id = $1
            FOR UPDATE
        `,
        [streamId],
    );

    return result.rows.length > 0;
};
