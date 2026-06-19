import { AGREEMENT_EVENT_SOURCE } from '@serverless-state-machine-cqrs/domain';
import type { AgreementEventType } from '@serverless-state-machine-cqrs/domain';
import type { TransactionalQueryable } from '@serverless-state-machine-cqrs/lambda-utils';
import type { AgreementStatus } from '@serverless-state-machine-cqrs/domain';

export const insertAgreementEvent = async (
    client: TransactionalQueryable,
    values: {
        agreementId: number;
        eventType: AgreementEventType | 'AgreementCreated';
        previousStatus: AgreementStatus | null;
        newStatus: AgreementStatus;
        actorId: string;
        actorType: string;
        requestId: string;
        idempotencyKey: string;
        payload: string;
    },
): Promise<void> => {
    await client.query(
        `
            INSERT INTO agreement_events (
                agreement_id,
                event_type,
                previous_status,
                new_status,
                actor_id,
                actor_type,
                request_id,
                idempotency_key,
                payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        `,
        [
            values.agreementId,
            values.eventType,
            values.previousStatus,
            values.newStatus,
            values.actorId,
            values.actorType,
            values.requestId,
            values.idempotencyKey,
            values.payload,
        ],
    );
};

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
