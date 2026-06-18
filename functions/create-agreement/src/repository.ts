import { AuthRole, AGREEMENT_EVENT_SOURCE } from './lambda-utils';

export type AgreementStatus = 'CREATED' | 'APPROVED' | 'FUNDED' | 'SETTLED';
export type ActorType = AuthRole;

export interface AgreementRecord {
    agreementId: string;
    status: AgreementStatus;
    merchantId: string;
    partnerId: string;
    amount: number;
}

export interface CreateAgreementInput {
    publicId: string;
    merchantId: string;
    partnerId: string;
    amount: number;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    actorId: string;
    actorType: ActorType;
}

export interface AgreementRepository {
    createAgreement(input: CreateAgreementInput): Promise<CreateAgreementResult>;
}

interface AgreementRow {
    id: number;
    public_id: string;
    status: AgreementStatus;
    merchant_id: string;
    partner_id: string;
    amount: string;
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

interface IdempotencyRow {
    request_hash: string;
    response_status_code: number;
    response_body: string;
}

export type CreateAgreementResult =
    | {
          kind: 'created';
          agreement: AgreementRecord;
          eventPayload: AgreementRecord;
          responseStatusCode: 201;
          responseBody: string;
      }
    | {
          kind: 'replayed';
          responseStatusCode: number;
          responseBody: string;
      }
    | {
          kind: 'conflict';
      };

export class PostgresAgreementRepository implements AgreementRepository {
    constructor(private readonly pool: TransactionPool) {}

    async createAgreement(input: CreateAgreementInput): Promise<CreateAgreementResult> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN', []);

            const existingIdempotency = await client.query<IdempotencyRow>(
                `
                    SELECT request_hash, response_status_code, response_body
                    FROM idempotency_keys
                    WHERE idempotency_key = $1 AND operation_type = 'create_agreement'
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

            const insertedAgreement = await client.query<AgreementRow>(
                `
                    INSERT INTO agreements (public_id, status, merchant_id, partner_id, amount)
                    VALUES ($1, 'CREATED', $2, $3, $4)
                    RETURNING id, public_id, status, merchant_id, partner_id, amount
                `,
                [input.publicId, input.merchantId, input.partnerId, input.amount],
            );

            const row = insertedAgreement.rows[0];
            const agreement = mapAgreementRow(row);
            const responseBody = JSON.stringify(agreement);

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
                    VALUES ($1, 'AgreementCreated', $2, $3, $4, $5, $6, $7, $8::jsonb)
                `,
                [
                    row.id,
                    null,
                    agreement.status,
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
                    VALUES ($1, 'create_agreement', $2, $3, $4, $5)
                `,
                [input.idempotencyKey, input.requestHash, 201, responseBody, row.id],
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
                    agreement.agreementId,
                    'AgreementCreated',
                    AGREEMENT_EVENT_SOURCE,
                    JSON.stringify({
                        agreementId: agreement.agreementId,
                        merchantId: agreement.merchantId,
                        partnerId: agreement.partnerId,
                        amount: agreement.amount,
                        previousStatus: null,
                        newStatus: 'CREATED',
                    }),
                    input.requestId,
                    input.idempotencyKey,
                ],
            );

            await client.query('COMMIT', []);

            return {
                kind: 'created',
                agreement,
                eventPayload: agreement,
                responseStatusCode: 201,
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

const mapAgreementRow = (row: AgreementRow): AgreementRecord => ({
    agreementId: row.public_id,
    status: row.status,
    merchantId: row.merchant_id,
    partnerId: row.partner_id,
    amount: Number(row.amount),
});
