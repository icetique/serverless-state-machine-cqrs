import type { AgreementEventType } from '@serverless-state-machine-cqrs/domain';
import type { StreamEventRecord } from '@serverless-state-machine-cqrs/domain';
import type { TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';
import type { ActorType } from '@serverless-state-machine-cqrs/domain';

export const insertEventStoreRow = async (
    client: TransactionalQueryable,
    values: {
        streamId: string;
        event: StreamEventRecord;
        actorId: string;
        actorType: ActorType;
        requestId: string;
        idempotencyKey: string;
    },
): Promise<void> => {
    const { streamId, event, actorId, actorType, requestId, idempotencyKey } = values;

    await client.query(
        `
            INSERT INTO event_store (
                stream_id,
                stream_version,
                event_type,
                payload,
                metadata
            )
            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        `,
        [
            streamId,
            event.streamVersion,
            event.eventType as AgreementEventType,
            JSON.stringify(event.payload),
            JSON.stringify({
                actor_id: actorId,
                actor_type: actorType,
                request_id: requestId,
                idempotency_key: idempotencyKey,
            }),
        ],
    );
};
