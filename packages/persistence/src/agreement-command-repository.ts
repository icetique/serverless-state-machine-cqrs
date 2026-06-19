import type {
    CreateAgreementCommand,
    SettleAgreementCommand,
    TransitionAgreementCommand,
} from '@serverless-state-machine-cqrs/domain';
import type { TransactionPool } from '@serverless-state-machine-cqrs/db-ports';
import {
    applyAgreementTransition,
    insertSettlementLedgerEntry,
    settlementPayloadExtension,
} from './apply-agreement-transition';
import {
    type AgreementLookup,
    type AgreementRecord,
    type AgreementRow,
    type CreateAgreementResult,
    type TransitionAgreementResult,
    mapAgreementRow,
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

const parseAgreementRecord = (body: string): AgreementRecord => JSON.parse(body) as AgreementRecord;

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

            return await applyAgreementTransition({
                client,
                agreementId: command.agreementId,
                eventType: command.eventType,
                idempotencyKey: command.idempotencyKey,
                requestHash: command.requestHash,
                requestId: command.requestId,
                actorId: command.actorId,
                actorType: command.actorType,
                expectedCurrentStatus: command.expectedCurrentStatus,
            });
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

            return await applyAgreementTransition({
                client,
                agreementId: command.agreementId,
                eventType: 'AgreementSettled',
                idempotencyKey: command.idempotencyKey,
                requestHash: command.requestHash,
                requestId: command.requestId,
                actorId: command.actorId,
                actorType: command.actorType,
                expectedCurrentStatus: 'FUNDED',
                extendPayload: settlementPayloadExtension,
                onBeforePersist: insertSettlementLedgerEntry,
            });
        } catch (error) {
            await client.query('ROLLBACK', []);
            throw error;
        } finally {
            client.release();
        }
    }
}
