import { randomUUID } from 'crypto';
import type {
    AgreementEventType,
    AgreementStatus,
    TransitionSpec,
    ActorType,
} from '@serverless-state-machine-cqrs/domain';
import { InvalidTransitionError, validateTransition } from '@serverless-state-machine-cqrs/domain';
import type { TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';
import type { AgreementRow, TransitionAgreementResult, TransitionPayload } from './agreement-types';
import { mapEventDetail } from './agreement-types';
import { checkIdempotency, insertIdempotencyKey } from './db/idempotency';
import { insertAgreementEvent, insertOutboxEvent } from './db/writers';

const parseTransitionPayload = (body: string): TransitionPayload => JSON.parse(body) as TransitionPayload;

export interface ApplyAgreementTransitionParams {
    client: TransactionalQueryable;
    agreementId: string;
    eventType: AgreementEventType;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    actorId: string;
    actorType: ActorType;
    expectedCurrentStatus?: AgreementStatus;
    extendPayload?: (
        base: TransitionPayload,
        context: { updated: AgreementRow; transition: TransitionSpec },
    ) => TransitionPayload;
    onBeforePersist?: (
        client: TransactionalQueryable,
        context: { updated: AgreementRow; payload: TransitionPayload },
    ) => Promise<void>;
}

export const applyAgreementTransition = async (
    params: ApplyAgreementTransitionParams,
): Promise<TransitionAgreementResult> => {
    const {
        client,
        agreementId,
        eventType,
        idempotencyKey,
        requestHash,
        requestId,
        actorId,
        actorType,
        expectedCurrentStatus,
        extendPayload,
        onBeforePersist,
    } = params;

    const idempotency = await checkIdempotency(client, idempotencyKey, eventType, requestHash, (row) =>
        parseTransitionPayload(row.response_body),
    );

    if (idempotency.kind === 'conflict') {
        await client.query('COMMIT', []);
        return { kind: 'conflict' };
    }

    if (idempotency.kind === 'replayed') {
        await client.query('COMMIT', []);
        return { kind: 'replayed', payload: idempotency.value };
    }

    const currentAgreement = await client.query<AgreementRow>(
        `
            SELECT id, public_id, status, merchant_id, partner_id, amount
            FROM agreements
            WHERE public_id = $1
            FOR UPDATE
        `,
        [agreementId],
    );

    const agreement = currentAgreement.rows[0];
    if (!agreement) {
        await client.query('COMMIT', []);
        return { kind: 'not_found' };
    }

    if (expectedCurrentStatus !== undefined && agreement.status !== expectedCurrentStatus) {
        await client.query('COMMIT', []);
        return { kind: 'invalid_transition', currentStatus: agreement.status };
    }

    const transition = validateTransition(eventType, agreement.status);
    if (transition instanceof InvalidTransitionError) {
        await client.query('COMMIT', []);
        return { kind: 'invalid_transition', currentStatus: agreement.status };
    }

    const updatedAgreement = await client.query<AgreementRow>(
        `
            UPDATE agreements
            SET status = $2, updated_at = current_timestamp
            WHERE id = $1
            RETURNING id, public_id, status, merchant_id, partner_id, amount
        `,
        [agreement.id, transition.to],
    );

    const updated = updatedAgreement.rows[0];
    let payload: TransitionPayload = mapEventDetail(updated, transition.from, transition.to);

    if (extendPayload) {
        payload = extendPayload(payload, { updated, transition });
    }

    if (onBeforePersist) {
        await onBeforePersist(client, { updated, payload });
    }

    const responseBody = JSON.stringify(payload);

    await insertAgreementEvent(client, {
        agreementId: updated.id,
        eventType,
        previousStatus: transition.from,
        newStatus: transition.to,
        actorId,
        actorType,
        requestId,
        idempotencyKey,
        payload: responseBody,
    });

    await insertIdempotencyKey(client, {
        idempotencyKey,
        operationType: eventType,
        requestHash,
        responseStatusCode: 200,
        responseBody,
        agreementId: updated.id,
    });

    await insertOutboxEvent(client, {
        aggregateId: payload.agreementId,
        eventType,
        payload: JSON.stringify(payload),
        requestId,
        idempotencyKey,
    });

    await client.query('COMMIT', []);

    return {
        kind: 'transitioned',
        payload,
    };
};

export const settlementPayloadExtension = (
    base: TransitionPayload,
    _context: { updated: AgreementRow; transition: TransitionSpec },
): TransitionPayload => ({
    ...base,
    transactionId: `txn_${randomUUID()}`,
});

export const insertSettlementLedgerEntry = async (
    client: TransactionalQueryable,
    context: { updated: AgreementRow; payload: TransitionPayload },
): Promise<void> => {
    const { updated, payload } = context;

    if (!payload.transactionId) {
        throw new Error('Settlement payload requires transactionId');
    }

    await client.query(
        `
            INSERT INTO ledger_entries (
                agreement_id,
                transaction_id,
                amount,
                entry_type
            )
            VALUES ($1, $2, $3, $4)
        `,
        [updated.id, payload.transactionId, updated.amount, 'settlement'],
    );
};
