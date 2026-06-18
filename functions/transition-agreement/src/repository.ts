import { randomUUID } from 'crypto';
import {
    AGREEMENT_EVENT_SOURCE,
    type AgreementEventDetail,
    type AgreementEventType,
    type AgreementStatus,
    AuthRole,
} from './lambda-utils';

export type ActorType = AuthRole | 'system';

export interface TransitionAgreementInput {
    agreementId: string;
    expectedCurrentStatus: AgreementStatus;
    nextStatus: AgreementStatus;
    eventType: AgreementEventType;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    actorId: string;
    actorType: ActorType;
}

export interface SettleAgreementInput {
    agreementId: string;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    actorId: string;
    actorType: ActorType;
    triggerSource: string;
    messageId?: string;
}

export interface AgreementRepository {
    findAgreementByPublicId(agreementId: string): Promise<AgreementLookup | null>;
    transitionAgreement(input: TransitionAgreementInput): Promise<TransitionAgreementResult>;
    settleAgreement(input: SettleAgreementInput): Promise<TransitionAgreementResult>;
}

interface TransitionResponseBody extends AgreementEventDetail {
    transactionId?: string;
}

interface AgreementRow {
    id: number;
    public_id: string;
    status: AgreementStatus;
    merchant_id: string;
    partner_id: string;
    amount: string;
}

export interface AgreementLookup {
    agreementId: string;
    status: AgreementStatus;
    merchantId: string;
    partnerId: string;
}

interface IdempotencyRow {
    request_hash: string;
    response_status_code: number;
    response_body: string;
}

interface QueryResult<Row> {
    rows: Row[];
}

export interface Queryable {
    query<Row>(text: string, values: unknown[]): Promise<QueryResult<Row>>;
}

export interface TransactionalQueryable extends Queryable {
    release(): void;
}

export interface TransactionPool {
    connect(): Promise<TransactionalQueryable>;
}

export type TransitionAgreementResult =
    | {
          kind: 'transitioned';
          eventPayload: AgreementEventDetail;
          responseStatusCode: 200;
          responseBody: string;
      }
    | {
          kind: 'replayed';
          responseStatusCode: number;
          responseBody: string;
      }
    | {
          kind: 'conflict';
      }
    | {
          kind: 'not_found';
      }
    | {
          kind: 'invalid_transition';
          currentStatus: AgreementStatus;
      };

export class PostgresAgreementRepository implements AgreementRepository {
    constructor(private readonly pool: TransactionPool) {}

    async findAgreementByPublicId(agreementId: string): Promise<AgreementLookup | null> {
        const result = await this.pool.connect();

        try {
            const agreement = await result.query<AgreementRow>(
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
            result.release();
        }
    }

    async transitionAgreement(input: TransitionAgreementInput): Promise<TransitionAgreementResult> {
        if (input.eventType === 'AgreementSettled') {
            throw new Error('Settlement must use settleAgreement');
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN', []);

            const existingIdempotency = await client.query<IdempotencyRow>(
                `
                    SELECT request_hash, response_status_code, response_body
                    FROM idempotency_keys
                    WHERE idempotency_key = $1 AND operation_type = $2
                    FOR UPDATE
                `,
                [input.idempotencyKey, input.eventType],
            );

            const existing = existingIdempotency.rows[0];
            if (existing) {
                await client.query('COMMIT', []);

                if (existing.request_hash !== input.requestHash) {
                    return { kind: 'conflict' };
                }

                return {
                    kind: 'replayed',
                    responseStatusCode: existing.response_status_code,
                    responseBody: existing.response_body,
                };
            }

            const currentAgreement = await client.query<AgreementRow>(
                `
                    SELECT id, public_id, status, merchant_id, partner_id, amount
                    FROM agreements
                    WHERE public_id = $1
                    FOR UPDATE
                `,
                [input.agreementId],
            );

            const agreement = currentAgreement.rows[0];
            if (!agreement) {
                await client.query('COMMIT', []);
                return { kind: 'not_found' };
            }

            if (agreement.status !== input.expectedCurrentStatus) {
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
                [agreement.id, input.nextStatus],
            );

            const updated = updatedAgreement.rows[0];
            const payload = mapEventDetail(updated, input.expectedCurrentStatus, input.nextStatus);
            const responsePayload: TransitionResponseBody = { ...payload };
            const responseBody = JSON.stringify(responsePayload);

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
                    updated.id,
                    input.eventType,
                    input.expectedCurrentStatus,
                    input.nextStatus,
                    input.actorId,
                    input.actorType,
                    input.requestId,
                    input.idempotencyKey,
                    responseBody,
                ],
            );

            await client.query(
                `
                    INSERT INTO idempotency_keys (
                        idempotency_key,
                        operation_type,
                        request_hash,
                        response_status_code,
                        response_body,
                        agreement_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                `,
                [input.idempotencyKey, input.eventType, input.requestHash, 200, responseBody, updated.id],
            );

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
                    payload.agreementId,
                    input.eventType,
                    AGREEMENT_EVENT_SOURCE,
                    JSON.stringify(payload),
                    input.requestId,
                    input.idempotencyKey,
                ],
            );

            await client.query('COMMIT', []);

            return {
                kind: 'transitioned',
                eventPayload: payload,
                responseStatusCode: 200,
                responseBody,
            };
        } catch (error) {
            await client.query('ROLLBACK', []);
            throw error;
        } finally {
            client.release();
        }
    }

    async settleAgreement(input: SettleAgreementInput): Promise<TransitionAgreementResult> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN', []);

            const existingIdempotency = await client.query<IdempotencyRow>(
                `
                    SELECT request_hash, response_status_code, response_body
                    FROM idempotency_keys
                    WHERE idempotency_key = $1 AND operation_type = 'AgreementSettled'
                    FOR UPDATE
                `,
                [input.idempotencyKey],
            );

            const existing = existingIdempotency.rows[0];
            if (existing) {
                await client.query('COMMIT', []);

                if (existing.request_hash !== input.requestHash) {
                    return { kind: 'conflict' };
                }

                return {
                    kind: 'replayed',
                    responseStatusCode: existing.response_status_code,
                    responseBody: existing.response_body,
                };
            }

            const currentAgreement = await client.query<AgreementRow>(
                `
                    SELECT id, public_id, status, merchant_id, partner_id, amount
                    FROM agreements
                    WHERE public_id = $1
                    FOR UPDATE
                `,
                [input.agreementId],
            );

            const agreement = currentAgreement.rows[0];
            if (!agreement) {
                await client.query('COMMIT', []);
                return { kind: 'not_found' };
            }

            if (agreement.status !== 'FUNDED') {
                await client.query('COMMIT', []);
                return { kind: 'invalid_transition', currentStatus: agreement.status };
            }

            const updatedAgreement = await client.query<AgreementRow>(
                `
                    UPDATE agreements
                    SET status = 'SETTLED', updated_at = current_timestamp
                    WHERE id = $1
                    RETURNING id, public_id, status, merchant_id, partner_id, amount
                `,
                [agreement.id],
            );

            const updated = updatedAgreement.rows[0];
            const payload = mapEventDetail(updated, 'FUNDED', 'SETTLED');
            const responsePayload: TransitionResponseBody = {
                ...payload,
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
                [updated.id, responsePayload.transactionId, updated.amount, 'settlement'],
            );

            const responseBody = JSON.stringify(responsePayload);

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
                    updated.id,
                    'AgreementSettled',
                    'FUNDED',
                    'SETTLED',
                    input.actorId,
                    input.actorType,
                    input.requestId,
                    input.idempotencyKey,
                    responseBody,
                ],
            );

            await client.query(
                `
                    INSERT INTO idempotency_keys (
                        idempotency_key,
                        operation_type,
                        request_hash,
                        response_status_code,
                        response_body,
                        agreement_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                `,
                [input.idempotencyKey, 'AgreementSettled', input.requestHash, 200, responseBody, updated.id],
            );

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
                    payload.agreementId,
                    'AgreementSettled',
                    AGREEMENT_EVENT_SOURCE,
                    JSON.stringify(payload),
                    input.requestId,
                    input.idempotencyKey,
                ],
            );

            await client.query('COMMIT', []);

            return {
                kind: 'transitioned',
                eventPayload: payload,
                responseStatusCode: 200,
                responseBody,
            };
        } catch (error) {
            await client.query('ROLLBACK', []);
            throw error;
        } finally {
            client.release();
        }
    }
}

const mapEventDetail = (
    row: AgreementRow,
    previousStatus: AgreementStatus,
    newStatus: AgreementStatus,
): AgreementEventDetail => ({
    agreementId: row.public_id,
    merchantId: row.merchant_id,
    partnerId: row.partner_id,
    amount: Number(row.amount),
    previousStatus,
    newStatus,
});
