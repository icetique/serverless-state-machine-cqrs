import { createHash, randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Pool } from 'pg';
import { PostgresAgreementCommandRepository } from '../../src/agreement-command-repository';
import {
    fingerprintReadModels,
    rebuildProjections,
    snapshotReadModels,
} from '../../src/projections/rebuild-projections';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL?.trim();
const describeIntegration = databaseUrl ? describe : describe.skip;

const hashRequest = (payload: unknown): string => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const merchantAuth = { subject: 'merchant-sub', role: 'merchant' as const, merchantId: 'merchant_1' };
const partnerAuth = { subject: 'partner-sub', role: 'partner' as const, partnerId: 'partner_2' };

describeIntegration('Projection rebuild (Postgres)', () => {
    let pool: Pool;
    let repository: PostgresAgreementCommandRepository;

    beforeAll(() => {
        pool = new Pool({ connectionString: databaseUrl, max: 2 });
        repository = new PostgresAgreementCommandRepository(pool);
    });

    afterAll(async () => {
        await pool.end();
    });

    it('rebuilds read models to match the pre-rebuild snapshot', async () => {
        const publicId = `agr_rebuild_${randomUUID()}`;
        const merchantId = 'merchant_1';
        const partnerId = 'partner_2';
        const amount = 1000;
        const transactionId = `txn_${randomUUID()}`;

        const created = await repository.createAgreement({
            publicId,
            merchantId,
            partnerId,
            amount,
            idempotencyKey: `idem_create_${randomUUID()}`,
            requestHash: hashRequest({ publicId, merchantId, partnerId, amount }),
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'merchant',
        });
        expect(created.kind).toBe('created');

        const approved = await repository.transitionAgreement({
            agreementId: publicId,
            eventType: 'AgreementApproved',
            idempotencyKey: `idem_approve_${randomUUID()}`,
            requestHash: hashRequest({ agreementId: publicId, eventType: 'AgreementApproved' }),
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'partner',
            auth: partnerAuth,
        });
        expect(approved.kind).toBe('transitioned');

        const funded = await repository.transitionAgreement({
            agreementId: publicId,
            eventType: 'AgreementFunded',
            idempotencyKey: `idem_fund_${randomUUID()}`,
            requestHash: hashRequest({ agreementId: publicId, eventType: 'AgreementFunded' }),
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'merchant',
            auth: merchantAuth,
        });
        expect(funded.kind).toBe('transitioned');

        const settled = await repository.settleAgreement({
            agreementId: publicId,
            transactionId,
            idempotencyKey: `idem_settle_${randomUUID()}`,
            requestHash: hashRequest({ agreementId: publicId, eventType: 'AgreementSettled' }),
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'system',
            triggerSource: 'integration_test',
        });
        expect(settled.kind).toBe('transitioned');

        const before = await snapshotReadModels(pool);
        const beforeFingerprint = fingerprintReadModels(before);

        const client = await pool.connect();
        try {
            await rebuildProjections(client);
        } finally {
            client.release();
        }

        const after = await snapshotReadModels(pool);
        const afterFingerprint = fingerprintReadModels(after);

        expect(afterFingerprint).toBe(beforeFingerprint);
        expect(after.agreements.some((row) => row.public_id === publicId && row.status === 'SETTLED')).toBe(true);
        expect(after.ledger.some((row) => row.transaction_id === transactionId)).toBe(true);
    });
});
