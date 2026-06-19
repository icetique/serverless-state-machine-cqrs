import type { StreamEventRecord } from '@serverless-state-machine-cqrs/domain';
import type { TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';

export const projectAgreementEvent = async (
    client: TransactionalQueryable,
    event: StreamEventRecord,
): Promise<void> => {
    const { payload, streamVersion } = event;

    if (event.eventType === 'AgreementCreated') {
        await client.query(
            `
                INSERT INTO agreements_read_model (
                    public_id,
                    status,
                    merchant_id,
                    partner_id,
                    amount,
                    stream_version
                )
                VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
                payload.agreementId,
                payload.newStatus,
                payload.merchantId,
                payload.partnerId,
                payload.amount,
                streamVersion,
            ],
        );
        return;
    }

    await client.query(
        `
            UPDATE agreements_read_model
            SET status = $2,
                stream_version = $3,
                updated_at = current_timestamp
            WHERE public_id = $1
        `,
        [payload.agreementId, payload.newStatus, streamVersion],
    );
};

export const projectLedgerEvent = async (client: TransactionalQueryable, event: StreamEventRecord): Promise<void> => {
    if (event.eventType !== 'AgreementSettled') {
        return;
    }

    const transactionId = event.payload.transactionId;
    if (!transactionId) {
        throw new Error('Settlement event requires transactionId in payload');
    }

    await client.query(
        `
            INSERT INTO ledger_read_model (
                transaction_id,
                agreement_id,
                amount,
                entry_type
            )
            VALUES ($1, $2, $3, $4)
        `,
        [transactionId, event.payload.agreementId, event.payload.amount, 'settlement'],
    );
};
