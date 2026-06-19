import type { AgreementEventType, StreamEventRecord } from '@serverless-state-machine-cqrs/domain';
import type { Queryable, TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';

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

const mapStreamRows = (rows: EventStoreRow[]): StreamEventRecord[] =>
    rows.map((row) => ({
        streamVersion: row.stream_version,
        eventType: row.event_type,
        payload: row.payload,
    }));

export const readStreamEvents = async (client: Queryable, streamId: string): Promise<StreamEventRecord[]> => {
    const result = await client.query<EventStoreRow>(
        `
            SELECT stream_version, event_type, payload, metadata
            FROM event_store
            WHERE stream_id = $1
            ORDER BY stream_version ASC
        `,
        [streamId],
    );

    return mapStreamRows(result.rows);
};

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

    return mapStreamRows(result.rows);
};
