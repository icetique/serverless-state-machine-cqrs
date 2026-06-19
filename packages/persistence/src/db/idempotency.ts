import type { TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';

export interface IdempotencyRow {
    request_hash: string;
    response_status_code: number;
    response_body: string;
}

export type IdempotencyGate<TReplay> =
    | { kind: 'proceed' }
    | { kind: 'conflict' }
    | { kind: 'replayed'; value: TReplay };

export const checkIdempotency = async <TReplay>(
    client: TransactionalQueryable,
    idempotencyKey: string,
    operationType: string,
    requestHash: string,
    parseReplay: (row: IdempotencyRow) => TReplay,
): Promise<IdempotencyGate<TReplay>> => {
    const existingIdempotency = await client.query<IdempotencyRow>(
        `
            SELECT request_hash, response_status_code, response_body
            FROM idempotency_keys
            WHERE idempotency_key = $1 AND operation_type = $2
            FOR UPDATE
        `,
        [idempotencyKey, operationType],
    );

    const existing = existingIdempotency.rows[0];

    if (!existing) {
        return { kind: 'proceed' };
    }

    if (existing.request_hash !== requestHash) {
        return { kind: 'conflict' };
    }

    return { kind: 'replayed', value: parseReplay(existing) };
};

export const insertIdempotencyKey = async (
    client: TransactionalQueryable,
    values: {
        idempotencyKey: string;
        operationType: string;
        requestHash: string;
        responseStatusCode: number;
        responseBody: string;
        agreementId: number;
    },
): Promise<void> => {
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
        [
            values.idempotencyKey,
            values.operationType,
            values.requestHash,
            values.responseStatusCode,
            values.responseBody,
            values.agreementId,
        ],
    );
};
