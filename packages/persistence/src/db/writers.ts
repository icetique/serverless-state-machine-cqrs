import { AGREEMENT_EVENT_SOURCE } from '@serverless-state-machine-cqrs/domain';
import type { AgreementEventType } from '@serverless-state-machine-cqrs/domain';
import type { TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';

export const insertOutboxEvent = async (
    client: TransactionalQueryable,
    values: {
        aggregateId: string;
        eventType: AgreementEventType | 'AgreementCreated';
        payload: string;
        requestId: string;
        idempotencyKey: string;
    },
): Promise<void> => {
    await client.query(
        `
            INSERT INTO outbox_events (
                aggregate_type,
                aggregate_id,
                event_type,
                event_source,
                payload,
                request_id,
                idempotency_key
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        `,
        [
            'agreement',
            values.aggregateId,
            values.eventType,
            AGREEMENT_EVENT_SOURCE,
            values.payload,
            values.requestId,
            values.idempotencyKey,
        ],
    );
};
