import { randomUUID } from 'crypto';
import type {
    CreateAgreementCommand,
    SettleAgreementCommand,
    TransitionAgreementCommand,
} from '@serverless-state-machine-cqrs/domain';
import { InvalidTransitionError, validateTransition } from '@serverless-state-machine-cqrs/domain';
import type { TransactionPool } from '@serverless-state-machine-cqrs/lambda-utils';
import {
    type AgreementLookup,
    type AgreementRecord,
    type AgreementRow,
    type CreateAgreementResult,
    type TransitionAgreementResult,
    type TransitionPayload,
    mapAgreementRow,
    mapEventDetail,
} from './agreement-types';
import { checkIdempotency, insertIdempotencyKey } from './db/idempotency';
import { insertAgreementEvent, insertOutboxEvent } from './db/writers';

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

const parseAgreementRecord = (body: string): AgreementRecord => {
    const parsed = JSON.parse(body) as AgreementRecord;
    return parsed;
};

const parseTransitionPayload = (body: string): TransitionPayload => {
    const parsed = JSON.parse(body) as TransitionPayload;
    return parsed;
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

            const insertedAgreement = await client.query<AgreementRow>(
                `
                    INSERT INTO agreements (public_id, status, merchant_id, partner_id, amount)
                    VALUES ($1, 'CREATED', $2, $3, $4)
                    RETURNING id, public_id, status, merchant_id, partner_id, amount
                `,
                [command.publicId, command.merchantId, command.partnerId, command.amount],
            );

            const row = insertedAgreement.rows[0];
            const agreement = mapAgreementRow(row);
            const responseBody = JSON.stringify(agreement);

            await insertAgreementEvent(client, {
                agreementId: row.id,
                eventType: 'AgreementCreated',
                previousStatus: null,
                newStatus: agreement.status,
                actorId: command.actorId,
                actorType: command.actorType,
                requestId: command.requestId,
                idempotencyKey: command.idempotencyKey,
                payload: responseBody,
            });

            await insertIdempotencyKey(client, {
                idempotencyKey: command.idempotencyKey,
                operationType: 'create_agreement',
                requestHash: command.requestHash,
                responseStatusCode: 201,
                responseBody,
                agreementId: row.id,
            });

            await insertOutboxEvent(client, {
                aggregateId: agreement.agreementId,
                eventType: 'AgreementCreated',
                payload: JSON.stringify({
                    agreementId: agreement.agreementId,
                    merchantId: agreement.merchantId,
                    partnerId: agreement.partnerId,
                    amount: agreement.amount,
                    previousStatus: null,
                    newStatus: 'CREATED',
                }),
                requestId: command.requestId,
                idempotencyKey: command.idempotencyKey,
            });

            await client.query('COMMIT', []);

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
            const agreement = await client.query<AgreementRow>(
                `
                    SELECT id, public_id, status, merchant_id, partner_id, amount
                    FROM agreements
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
        if (command.eventType === 'AgreementSettled') {
            throw new Error('Settlement must use settleAgreement');
        }

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

            const currentAgreement = await client.query<AgreementRow>(
                `
                    SELECT id, public_id, status, merchant_id, partner_id, amount
                    FROM agreements
                    WHERE public_id = $1
                    FOR UPDATE
                `,
                [command.agreementId],
            );

            const agreement = currentAgreement.rows[0];
            if (!agreement) {
                await client.query('COMMIT', []);
                return { kind: 'not_found' };
            }

            const transition = validateTransition(command.eventType, agreement.status);
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
            const payload: TransitionPayload = mapEventDetail(updated, transition.from, transition.to);
            const responseBody = JSON.stringify(payload);

            await insertAgreementEvent(client, {
                agreementId: updated.id,
                eventType: command.eventType,
                previousStatus: transition.from,
                newStatus: transition.to,
                actorId: command.actorId,
                actorType: command.actorType,
                requestId: command.requestId,
                idempotencyKey: command.idempotencyKey,
                payload: responseBody,
            });

            await insertIdempotencyKey(client, {
                idempotencyKey: command.idempotencyKey,
                operationType: command.eventType,
                requestHash: command.requestHash,
                responseStatusCode: 200,
                responseBody,
                agreementId: updated.id,
            });

            await insertOutboxEvent(client, {
                aggregateId: payload.agreementId,
                eventType: command.eventType,
                payload: JSON.stringify(payload),
                requestId: command.requestId,
                idempotencyKey: command.idempotencyKey,
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

            const currentAgreement = await client.query<AgreementRow>(
                `
                    SELECT id, public_id, status, merchant_id, partner_id, amount
                    FROM agreements
                    WHERE public_id = $1
                    FOR UPDATE
                `,
                [command.agreementId],
            );

            const agreement = currentAgreement.rows[0];
            if (!agreement) {
                await client.query('COMMIT', []);
                return { kind: 'not_found' };
            }

            const transition = validateTransition('AgreementSettled', agreement.status);
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
            const payload: TransitionPayload = {
                ...mapEventDetail(updated, transition.from, transition.to),
                transactionId: `txn_${randomUUID()}`,
            };

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

            const responseBody = JSON.stringify(payload);

            await insertAgreementEvent(client, {
                agreementId: updated.id,
                eventType: transition.eventType,
                previousStatus: transition.from,
                newStatus: transition.to,
                actorId: command.actorId,
                actorType: command.actorType,
                requestId: command.requestId,
                idempotencyKey: command.idempotencyKey,
                payload: responseBody,
            });

            await insertIdempotencyKey(client, {
                idempotencyKey: command.idempotencyKey,
                operationType: 'AgreementSettled',
                requestHash: command.requestHash,
                responseStatusCode: 200,
                responseBody,
                agreementId: updated.id,
            });

            await insertOutboxEvent(client, {
                aggregateId: payload.agreementId,
                eventType: transition.eventType,
                payload: JSON.stringify(payload),
                requestId: command.requestId,
                idempotencyKey: command.idempotencyKey,
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
