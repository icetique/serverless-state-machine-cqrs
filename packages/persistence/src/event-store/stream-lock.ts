import type { TransactionalQueryable } from '@serverless-state-machine-cqrs/db-ports';

/** Serializes writers on a stream (including empty streams where FOR UPDATE has no rows). */
export const lockAgreementStream = async (client: TransactionalQueryable, streamId: string): Promise<void> => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), 0)`, [streamId]);
};
