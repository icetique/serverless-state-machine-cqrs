import { createHash } from 'crypto';
import type { AgreementEventType, StreamEventRecord } from '@serverless-state-machine-cqrs/domain';
import type { Queryable, TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';
import { projectAgreementEvent, projectLedgerEvent } from './read-models';

interface EventStoreGlobalRow {
    id: number;
    stream_id: string;
    stream_version: number;
    event_type: AgreementEventType;
    payload: StreamEventRecord['payload'];
}

export interface ReadModelSnapshot {
    agreements: Array<{
        public_id: string;
        status: string;
        merchant_id: string;
        partner_id: string;
        amount: string;
        stream_version: number;
    }>;
    ledger: Array<{
        transaction_id: string;
        agreement_id: string;
        amount: string;
        entry_type: string;
    }>;
}

export const loadAllEvents = async (client: Queryable): Promise<StreamEventRecord[]> => {
    const result = await client.query<EventStoreGlobalRow>(
        `
            SELECT stream_version, event_type, payload
            FROM event_store
            ORDER BY id ASC
        `,
        [],
    );

    return result.rows.map((row) => ({
        streamVersion: row.stream_version,
        eventType: row.event_type,
        payload: row.payload,
    }));
};

export const snapshotReadModels = async (client: Queryable): Promise<ReadModelSnapshot> => {
    const agreements = await client.query<ReadModelSnapshot['agreements'][number]>(
        `
            SELECT public_id, status, merchant_id, partner_id, amount::text, stream_version
            FROM agreements_read_model
            ORDER BY public_id ASC
        `,
        [],
    );

    const ledger = await client.query<ReadModelSnapshot['ledger'][number]>(
        `
            SELECT transaction_id, agreement_id, amount::text, entry_type
            FROM ledger_read_model
            ORDER BY transaction_id ASC
        `,
        [],
    );

    return {
        agreements: agreements.rows,
        ledger: ledger.rows,
    };
};

export const fingerprintReadModels = (snapshot: ReadModelSnapshot): string =>
    createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

export const rebuildProjections = async (client: TransactionalQueryable): Promise<void> => {
    await client.query('BEGIN', []);

    try {
        await client.query('TRUNCATE agreements_read_model, ledger_read_model', []);
        const events = await loadAllEvents(client);

        for (const event of events) {
            await projectAgreementEvent(client, event);
            await projectLedgerEvent(client, event);
        }

        await client.query('COMMIT', []);
    } catch (error) {
        await client.query('ROLLBACK', []);
        throw error;
    }
};
