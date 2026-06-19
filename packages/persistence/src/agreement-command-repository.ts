import { randomUUID } from 'crypto';
import type {
    CreateAgreementCommand,
    SettleAgreementCommand,
    TransitionAgreementCommand,
} from '@serverless-state-machine-cqrs/domain';
import { decideCreate, decideSettlement, decideTransition, fromEvents } from '@serverless-state-machine-cqrs/domain';
import type { TransactionPool } from '@serverless-state-machine-cqrs/db-ports';
import { insertEventStoreRow } from './event-store/append-event';
import { loadStreamEvents, lockAgreementReadModel } from './event-store/load-stream';
import { projectAgreementEvent, projectLedgerEvent } from './projections/read-models';
import {
    type AgreementLookup,
    type AgreementRecord,
    type CreateAgreementResult,
    type TransitionAgreementResult,
    type TransitionPayload,
} from './agreement-types';
import { checkIdempotency, insertIdempotencyKey } from './db/idempotency';
import { insertOutboxEvent } from './db/writers';

export type {
    AgreementLookup,
    AgreementRecord,
    CreateAgreementResult,
    TransitionAgreementResult,
    TransitionPayload,
} from './agreement-types';

export interface AgreementCommandRepository {
    createAgreement(command: CreateAgreementCommand): Promise<CreateAgreementResult>;
    findAgreementByPublicId(agreementId: string): Promise<AgreementLookup | null>;
    transitionAgreement(command: TransitionAgreementCommand): Promise<TransitionAgreementResult>;
    settleAgreement(command: SettleAgreementCommand): Promise<TransitionAgreementResult>;
}

interface ReadModelRow {
    public_id: string;
    status: AgreementLookup['status'];
    merchant_id: string;
    partner_id: string;
    amount: string;
}

const parseAgreementRecord = (body: string): AgreementRecord => JSON.parse(body) as AgreementRecord;
const parseTransitionPayload = (body: string): TransitionPayload => JSON.parse(body) as TransitionPayload;

const toAgreementRecord = (payload: TransitionPayload): AgreementRecord => ({
    agreementId: payload.agreementId,
    status: payload.newStatus,
    merchantId: payload.merchantId,
    partnerId: payload.partnerId,
    amount: payload.amount,
});

const persistAppendedEvent = async (
    client: Parameters<typeof insertEventStoreRow>[0],
    input: {
        streamId: string;
        operationType: string;
        requestHash: string;
        requestId: string;
        actorId: string;
        actorType: CreateAgreementCommand['actorType'];
        idempotencyKey: string;
        event: import('@serverless-state-machine-cqrs/domain').StreamEventRecord;
        responseStatusCode: number;
    },
): Promise<TransitionPayload> => {
    const { event } = input;

    await insertEventStoreRow(client, {
        streamId: input.streamId,
        event,
        actorId: input.actorId,
        actorType: input.actorType,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
    });

    await projectAgreementEvent(client, event);
    await projectLedgerEvent(client, event);

    const responseBody = JSON.stringify(event.payload);

    await insertIdempotencyKey(client, {
        idempotencyKey: input.idempotencyKey,
        operationType: input.operationType,
        requestHash: input.requestHash,
        responseStatusCode: input.responseStatusCode,
        responseBody,
        streamId: input.streamId,
    });

    await insertOutboxEvent(client, {
        aggregateId: event.payload.agreementId,
        eventType: event.eventType,
        payload: responseBody,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
    });

    return event.payload;
};

export class PostgresAgreementCommandRepository implements AgreementCommandRepository {
    constructor(private readonly pool: TransactionPool) {}

    async createAgreement(command: CreateAgreementCommand): Promise<CreateAgreementResult> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN', []);

            const idempotency = await checkIdempotency(
                client,
                command.idempotencyKey,
                'create_agreement',
                command.requestHash,
                (row) => parseAgreementRecord(row.response_body),
            );

            if (idempotency.kind === 'conflict') {
                await client.query('COMMIT', []);
                return { kind: 'conflict' };
            }

            if (idempotency.kind === 'replayed') {
                await client.query('COMMIT', []);
                return { kind: 'replayed', agreement: idempotency.value };
            }

            const streamEvents = await loadStreamEvents(client, command.publicId);
            const aggregate = fromEvents(streamEvents);
            const decision = decideCreate(aggregate, {
                agreementId: command.publicId,
                merchantId: command.merchantId,
                partnerId: command.partnerId,
                amount: command.amount,
            });

            if (decision.kind === 'stream_exists') {
                await client.query('ROLLBACK', []);
                return { kind: 'conflict' };
            }

            const payload = await persistAppendedEvent(client, {
                streamId: command.publicId,
                operationType: 'create_agreement',
                requestHash: command.requestHash,
                requestId: command.requestId,
                actorId: command.actorId,
                actorType: command.actorType,
                idempotencyKey: command.idempotencyKey,
                event: decision.event,
                responseStatusCode: 201,
            });

            await client.query('COMMIT', []);

            const agreement = toAgreementRecord(payload);

            return {
                kind: 'created',
                agreement,
                eventPayload: agreement,
            };
        } catch (error) {
            await client.query('ROLLBACK', []);
            throw error;
        } finally {
            client.release();
        }
    }

    async findAgreementByPublicId(agreementId: string): Promise<AgreementLookup | null> {
        const client = await this.pool.connect();

        try {
            const agreement = await client.query<ReadModelRow>(
                `
                    SELECT public_id, status, merchant_id, partner_id, amount
                    FROM agreements_read_model
                    WHERE public_id = $1
                `,
                [agreementId],
            );

            const row = agreement.rows[0];

            return row
                ? {
                      agreementId: row.public_id,
                      status: row.status,
                      merchantId: row.merchant_id,
                      partnerId: row.partner_id,
                  }
                : null;
        } finally {
            client.release();
        }
    }

    async transitionAgreement(command: TransitionAgreementCommand): Promise<TransitionAgreementResult> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN', []);

            const idempotency = await checkIdempotency(
                client,
                command.idempotencyKey,
                command.eventType,
                command.requestHash,
                (row) => parseTransitionPayload(row.response_body),
            );

            if (idempotency.kind === 'conflict') {
                await client.query('COMMIT', []);
                return { kind: 'conflict' };
            }

            if (idempotency.kind === 'replayed') {
                await client.query('COMMIT', []);
                return { kind: 'replayed', payload: idempotency.value };
            }

            const hasReadModel = await lockAgreementReadModel(client, command.agreementId);
            const streamEvents = await loadStreamEvents(client, command.agreementId);
            const aggregate = fromEvents(streamEvents);

            if (!hasReadModel && !aggregate.state) {
                await client.query('COMMIT', []);
                return { kind: 'not_found' };
            }

            const decision = decideTransition(aggregate, command.eventType, command.expectedVersion);

            if (decision.kind === 'not_found') {
                await client.query('COMMIT', []);
                return { kind: 'not_found' };
            }

            if (decision.kind === 'invalid_transition') {
                await client.query('COMMIT', []);
                return { kind: 'invalid_transition', currentStatus: decision.currentStatus };
            }

            if (decision.kind === 'version_conflict') {
                await client.query('COMMIT', []);
                return { kind: 'conflict' };
            }

            const payload = await persistAppendedEvent(client, {
                streamId: command.agreementId,
                operationType: command.eventType,
                requestHash: command.requestHash,
                requestId: command.requestId,
                actorId: command.actorId,
                actorType: command.actorType,
                idempotencyKey: command.idempotencyKey,
                event: decision.event,
                responseStatusCode: 200,
            });

            await client.query('COMMIT', []);

            return {
                kind: 'transitioned',
                payload,
            };
        } catch (error) {
            await client.query('ROLLBACK', []);
            throw error;
        } finally {
            client.release();
        }
    }

    async settleAgreement(command: SettleAgreementCommand): Promise<TransitionAgreementResult> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN', []);

            const idempotency = await checkIdempotency(
                client,
                command.idempotencyKey,
                'AgreementSettled',
                command.requestHash,
                (row) => parseTransitionPayload(row.response_body),
            );

            if (idempotency.kind === 'conflict') {
                await client.query('COMMIT', []);
                return { kind: 'conflict' };
            }

            if (idempotency.kind === 'replayed') {
                await client.query('COMMIT', []);
                return { kind: 'replayed', payload: idempotency.value };
            }

            const hasReadModel = await lockAgreementReadModel(client, command.agreementId);
            const streamEvents = await loadStreamEvents(client, command.agreementId);
            const aggregate = fromEvents(streamEvents);

            if (!hasReadModel && !aggregate.state) {
                await client.query('COMMIT', []);
                return { kind: 'not_found' };
            }

            const transactionId = `txn_${randomUUID()}`;
            const decision = decideSettlement(aggregate, transactionId);

            if (decision.kind === 'not_found') {
                await client.query('COMMIT', []);
                return { kind: 'not_found' };
            }

            if (decision.kind === 'invalid_transition') {
                await client.query('COMMIT', []);
                return { kind: 'invalid_transition', currentStatus: decision.currentStatus };
            }

            if (decision.kind === 'version_conflict') {
                await client.query('COMMIT', []);
                return { kind: 'conflict' };
            }

            const payload = await persistAppendedEvent(client, {
                streamId: command.agreementId,
                operationType: 'AgreementSettled',
                requestHash: command.requestHash,
                requestId: command.requestId,
                actorId: command.actorId,
                actorType: command.actorType,
                idempotencyKey: command.idempotencyKey,
                event: decision.event,
                responseStatusCode: 200,
            });

            await client.query('COMMIT', []);

            return {
                kind: 'transitioned',
                payload,
            };
        } catch (error) {
            await client.query('ROLLBACK', []);
            throw error;
        } finally {
            client.release();
        }
    }
}
