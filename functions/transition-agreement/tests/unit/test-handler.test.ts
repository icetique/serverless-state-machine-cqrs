import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHandler } from '../../handlers/http/app';
import { AgreementRepository, TransitionAgreementResult } from '../../src/repository';
import { SettlementProcessor } from '../../src/settlement/settlement-processor';
import { TEST_JWT_CLAIMS, asJwtHandlerEvent, createHttpApiEvent } from '../../../../tests/fixtures/http-api/http-api';

const createEvent = (
    agreementId?: string,
    idempotencyKey?: string,
    claims = TEST_JWT_CLAIMS.partner,
    extraHeaders?: Record<string, string>,
) =>
    createHttpApiEvent({
        pathParameters: agreementId ? { agreementId } : null,
        headers: {
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
            ...(extraHeaders ?? {}),
        },
        claims,
        requestId: 'req_123',
    });

const parseBody = (body: string | undefined) => JSON.parse(body ?? '{}');

const config = {
    eventType: 'AgreementApproved' as const,
    expectedCurrentStatus: 'CREATED' as const,
    nextStatus: 'APPROVED' as const,
};

describe('Transition agreement handler', () => {
    const repository: jest.Mocked<AgreementRepository> = {
        createAgreement: jest.fn(),
        findAgreementByPublicId: jest.fn(),
        transitionAgreement: jest.fn(),
        settleAgreement: jest.fn(),
    };
    const settlementProcessor: jest.Mocked<SettlementProcessor> = {
        process: jest.fn(),
    };

    beforeEach(() => {
        repository.transitionAgreement.mockReset();
        repository.settleAgreement.mockReset();
        repository.findAgreementByPublicId.mockReset();
        settlementProcessor.process.mockReset();
        process.env.ENABLE_MANUAL_SETTLEMENT_TRIGGER = 'true';
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const transitionedResult: TransitionAgreementResult = {
        kind: 'transitioned',
        payload: {
            agreementId: 'agr_123',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
            previousStatus: 'CREATED',
            newStatus: 'APPROVED',
        },
    };

    it('transitions an agreement', async () => {
        repository.findAgreementByPublicId.mockResolvedValue({
            agreementId: 'agr_123',
            status: 'CREATED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
        });
        repository.transitionAgreement.mockResolvedValue(transitionedResult);

        const result = await createHandler(repository, config, settlementProcessor)(createEvent('agr_123', 'idem_1'));

        expect(result.statusCode).toBe(200);
        expect(repository.transitionAgreement).toHaveBeenCalledWith(
            expect.objectContaining({
                agreementId: 'agr_123',
                idempotencyKey: 'idem_1',
                eventType: 'AgreementApproved',
            }),
        );
    });

    it('returns 400 when the idempotency key is missing', async () => {
        const result = await createHandler(repository, config, settlementProcessor)(createEvent('agr_123'));
        expect(result.statusCode).toBe(400);
    });

    it('returns 404 when the agreement is not found', async () => {
        repository.findAgreementByPublicId.mockResolvedValue(null);
        const result = await createHandler(repository, config, settlementProcessor)(createEvent('agr_123', 'idem_1'));
        expect(result.statusCode).toBe(404);
    });

    it('returns 409 for invalid state transitions', async () => {
        repository.findAgreementByPublicId.mockResolvedValue({
            agreementId: 'agr_123',
            status: 'FUNDED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
        });
        repository.transitionAgreement.mockResolvedValue({ kind: 'invalid_transition', currentStatus: 'FUNDED' });
        const result = await createHandler(repository, config, settlementProcessor)(createEvent('agr_123', 'idem_1'));
        expect(result.statusCode).toBe(409);
    });

    it('replays stored responses without reprocessing', async () => {
        repository.findAgreementByPublicId.mockResolvedValue({
            agreementId: 'agr_123',
            status: 'CREATED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
        });
        repository.transitionAgreement.mockResolvedValue({
            kind: 'replayed',
            payload: transitionedResult.payload,
        });
        const result = await createHandler(repository, config, settlementProcessor)(createEvent('agr_123', 'idem_1'));
        expect(result.statusCode).toBe(200);
        expect(settlementProcessor.process).not.toHaveBeenCalled();
    });

    it('returns 409 for idempotency conflicts', async () => {
        repository.findAgreementByPublicId.mockResolvedValue({
            agreementId: 'agr_123',
            status: 'CREATED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
        });
        repository.transitionAgreement.mockResolvedValue({ kind: 'conflict' });
        const result = await createHandler(repository, config, settlementProcessor)(createEvent('agr_123', 'idem_1'));
        expect(result.statusCode).toBe(409);
    });

    it('returns settlement transaction id when provided by the repository', async () => {
        repository.findAgreementByPublicId.mockResolvedValue({
            agreementId: 'agr_123',
            status: 'FUNDED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
        });
        settlementProcessor.process.mockResolvedValue({
            kind: 'transitioned',
            payload: {
                ...transitionedResult.payload,
                previousStatus: 'FUNDED',
                newStatus: 'SETTLED',
                transactionId: 'txn_123',
            },
        });

        const result = await createHandler(
            repository,
            {
                eventType: 'AgreementSettled',
                expectedCurrentStatus: 'FUNDED',
                nextStatus: 'SETTLED',
            },
            settlementProcessor,
        )(createEvent('agr_123', 'idem_settle', TEST_JWT_CLAIMS.merchant));

        expect(result.statusCode).toBe(200);
        expect(result.body).toContain('"transactionId":"txn_123"');
        expect(settlementProcessor.process).toHaveBeenCalledWith({
            agreementId: 'agr_123',
            idempotencyKey: 'idem_settle',
            requestId: 'req_123',
            triggerSource: 'http_manual',
            actorId: TEST_JWT_CLAIMS.merchant.sub,
            actorType: 'merchant',
        });
    });

    it('returns 403 when the manual settlement trigger is disabled', async () => {
        repository.findAgreementByPublicId.mockResolvedValue({
            agreementId: 'agr_123',
            status: 'FUNDED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
        });

        const previousFlag = process.env.ENABLE_MANUAL_SETTLEMENT_TRIGGER;
        process.env.ENABLE_MANUAL_SETTLEMENT_TRIGGER = 'false';

        try {
            const result = await createHandler(
                repository,
                {
                    eventType: 'AgreementSettled',
                    expectedCurrentStatus: 'FUNDED',
                    nextStatus: 'SETTLED',
                },
                settlementProcessor,
            )(createEvent('agr_123', 'idem_settle', TEST_JWT_CLAIMS.merchant));

            expect(result.statusCode).toBe(403);
            expect(result.body).toContain('Manual settlement trigger is disabled');
            expect(settlementProcessor.process).not.toHaveBeenCalled();
        } finally {
            process.env.ENABLE_MANUAL_SETTLEMENT_TRIGGER = previousFlag;
        }
    });

    it('returns 401 when the authorization token is missing', async () => {
        const result = await createHandler(
            repository,
            config,
            settlementProcessor,
        )(
            asJwtHandlerEvent(
                createHttpApiEvent({
                    pathParameters: { agreementId: 'agr_123' },
                    headers: { 'Idempotency-Key': 'idem_1' },
                }),
            ),
        );

        expect(result.statusCode).toBe(401);
    });

    it('returns 403 when the caller does not own the agreement for approval', async () => {
        repository.findAgreementByPublicId.mockResolvedValue({
            agreementId: 'agr_123',
            status: 'CREATED',
            merchantId: 'merchant_1',
            partnerId: 'partner_999',
        });

        const result = await createHandler(repository, config, settlementProcessor)(createEvent('agr_123', 'idem_1'));

        expect(result.statusCode).toBe(403);
        expect(parseBody(result.body)).toEqual({ message: 'Partners may only act on their own agreements' });
    });

    it('returns 403 when a partner calls a merchant-only transition', async () => {
        repository.findAgreementByPublicId.mockResolvedValue({
            agreementId: 'agr_123',
            status: 'APPROVED',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
        });

        const result = await createHandler(
            repository,
            {
                eventType: 'AgreementFunded',
                expectedCurrentStatus: 'APPROVED',
                nextStatus: 'FUNDED',
            },
            settlementProcessor,
        )(createEvent('agr_123', 'idem_1'));

        expect(result.statusCode).toBe(403);
        expect(parseBody(result.body)).toEqual({ message: 'Only merchants may perform AgreementFunded' });
    });
});
