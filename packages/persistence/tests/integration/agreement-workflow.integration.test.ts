import { createHash, randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Pool } from 'pg';
import { PostgresAgreementCommandRepository } from '../../src/agreement-command-repository';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL?.trim();
const describeIntegration = databaseUrl ? describe : describe.skip;

const hashRequest = (payload: unknown): string => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

describeIntegration('Agreement command workflow (Postgres)', () => {
    let pool: Pool;
    let repository: PostgresAgreementCommandRepository;

    beforeAll(() => {
        pool = new Pool({ connectionString: databaseUrl, max: 2 });
        repository = new PostgresAgreementCommandRepository(pool);
    });

    afterAll(async () => {
        await pool.end();
    });

    it('creates, approves, funds, and settles an agreement', async () => {
        const publicId = `agr_int_${randomUUID()}`;
        const merchantId = 'merchant_1';
        const partnerId = 'partner_2';
        const amount = 1000;
        const createKey = `idem_create_${randomUUID()}`;
        const createHashValue = hashRequest({ publicId, merchantId, partnerId, amount });

        const created = await repository.createAgreement({
            publicId,
            merchantId,
            partnerId,
            amount,
            idempotencyKey: createKey,
            requestHash: createHashValue,
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'merchant',
        });

        expect(created.kind).toBe('created');
        if (created.kind !== 'created') {
            throw new Error('Expected created agreement');
        }

        expect(created.agreement).toMatchObject({
            agreementId: publicId,
            status: 'CREATED',
            merchantId,
            partnerId,
            amount,
        });

        const approveKey = `idem_approve_${randomUUID()}`;
        const approveHash = hashRequest({ agreementId: publicId, eventType: 'AgreementApproved' });
        const approved = await repository.transitionAgreement({
            agreementId: publicId,
            expectedCurrentStatus: 'CREATED',
            nextStatus: 'APPROVED',
            eventType: 'AgreementApproved',
            idempotencyKey: approveKey,
            requestHash: approveHash,
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'partner',
        });

        expect(approved.kind).toBe('transitioned');
        if (approved.kind !== 'transitioned') {
            throw new Error('Expected approved transition');
        }

        expect(approved.payload.newStatus).toBe('APPROVED');

        const funded = await repository.transitionAgreement({
            agreementId: publicId,
            expectedCurrentStatus: 'APPROVED',
            nextStatus: 'FUNDED',
            eventType: 'AgreementFunded',
            idempotencyKey: `idem_fund_${randomUUID()}`,
            requestHash: hashRequest({ agreementId: publicId, eventType: 'AgreementFunded' }),
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'merchant',
        });

        expect(funded.kind).toBe('transitioned');
        if (funded.kind !== 'transitioned') {
            throw new Error('Expected funded transition');
        }

        expect(funded.payload.newStatus).toBe('FUNDED');

        const settled = await repository.settleAgreement({
            agreementId: publicId,
            idempotencyKey: `idem_settle_${randomUUID()}`,
            requestHash: hashRequest({ agreementId: publicId, eventType: 'AgreementSettled' }),
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'merchant',
            triggerSource: 'integration_test',
        });

        expect(settled.kind).toBe('transitioned');
        if (settled.kind !== 'transitioned') {
            throw new Error('Expected settled transition');
        }

        expect(settled.payload.newStatus).toBe('SETTLED');
        expect(settled.payload.transactionId).toMatch(/^txn_/);

        const lookup = await repository.findAgreementByPublicId(publicId);
        expect(lookup).toEqual({
            agreementId: publicId,
            status: 'SETTLED',
            merchantId,
            partnerId,
        });
    });

    it('replays and conflicts on create idempotency keys', async () => {
        const publicId = `agr_idem_${randomUUID()}`;
        const merchantId = 'merchant_1';
        const partnerId = 'partner_2';
        const amount = 1500;
        const idempotencyKey = `idem_replay_${randomUUID()}`;
        const requestHash = hashRequest({ publicId, merchantId, partnerId, amount });
        const command = {
            publicId,
            merchantId,
            partnerId,
            amount,
            idempotencyKey,
            requestHash,
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'merchant' as const,
        };

        const first = await repository.createAgreement(command);
        expect(first.kind).toBe('created');

        const replayed = await repository.createAgreement(command);
        expect(replayed.kind).toBe('replayed');
        if (replayed.kind === 'replayed') {
            expect(replayed.agreement.agreementId).toBe(publicId);
        }

        const conflict = await repository.createAgreement({
            ...command,
            publicId: `agr_other_${randomUUID()}`,
            requestHash: hashRequest({ publicId: 'different', merchantId, partnerId, amount }),
        });
        expect(conflict).toEqual({ kind: 'conflict' });
    });

    it('replays and conflicts on transition idempotency keys', async () => {
        const publicId = `agr_tr_${randomUUID()}`;
        const createResult = await repository.createAgreement({
            publicId,
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 500,
            idempotencyKey: `idem_setup_${randomUUID()}`,
            requestHash: hashRequest({ publicId }),
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'merchant',
        });
        expect(createResult.kind).toBe('created');

        const idempotencyKey = `idem_tr_${randomUUID()}`;
        const requestHash = hashRequest({ agreementId: publicId, eventType: 'AgreementApproved' });
        const transition = {
            agreementId: publicId,
            expectedCurrentStatus: 'CREATED' as const,
            nextStatus: 'APPROVED' as const,
            eventType: 'AgreementApproved' as const,
            idempotencyKey,
            requestHash,
            requestId: `req_${randomUUID()}`,
            actorId: 'integration_test',
            actorType: 'partner' as const,
        };

        const first = await repository.transitionAgreement(transition);
        expect(first.kind).toBe('transitioned');

        const replayed = await repository.transitionAgreement(transition);
        expect(replayed.kind).toBe('replayed');
        if (replayed.kind === 'replayed') {
            expect(replayed.payload.newStatus).toBe('APPROVED');
        }

        const conflict = await repository.transitionAgreement({
            ...transition,
            requestHash: hashRequest({ agreementId: publicId, eventType: 'AgreementFunded' }),
        });
        expect(conflict).toEqual({ kind: 'conflict' });
    });
});
