import { describe, expect, it, jest } from '@jest/globals';
import { DefaultSettlementProcessor } from '../../src/settlement/settlement-processor';
import { AgreementRepository, TransitionAgreementResult } from '../../src/repository';
import { buildSettlementProcessorInputFromMessage } from '../../src/settlement/settlement-message';

describe('Settlement processor', () => {
    const repository: jest.Mocked<AgreementRepository> = {
        createAgreement: jest.fn(),
        findAgreementByPublicId: jest.fn(),
        transitionAgreement: jest.fn(),
        settleAgreement: jest.fn(),
    };

    const transitionedResult: TransitionAgreementResult = {
        kind: 'transitioned',
        payload: {
            agreementId: 'agr_123',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
            previousStatus: 'FUNDED',
            newStatus: 'SETTLED',
            transactionId: 'txn_123',
        },
    };

    it('settles an agreement through the repository', async () => {
        repository.settleAgreement.mockResolvedValue(transitionedResult);

        const processor = new DefaultSettlementProcessor(repository);
        const result = await processor.process({
            agreementId: 'agr_123',
            idempotencyKey: 'idem_1',
            requestId: 'req_1',
            triggerSource: 'http_manual',
            actorId: 'merchant_1',
            actorType: 'merchant',
        });

        expect(result).toBe(transitionedResult);
        expect(repository.settleAgreement).toHaveBeenCalledWith({
            agreementId: 'agr_123',
            idempotencyKey: 'idem_1',
            requestHash: expect.any(String),
            requestId: 'req_1',
            triggerSource: 'http_manual',
            actorId: 'merchant_1',
            actorType: 'merchant',
            messageId: undefined,
        });
    });

    it('replays without additional processor side effects', async () => {
        repository.settleAgreement.mockResolvedValue({
            kind: 'replayed',
            payload: transitionedResult.payload,
        });

        const processor = new DefaultSettlementProcessor(repository);
        const result = await processor.process({
            agreementId: 'agr_123',
            idempotencyKey: 'idem_1',
            requestId: 'req_1',
            triggerSource: 'http_manual',
            actorId: 'merchant_1',
            actorType: 'merchant',
        });

        expect(result.kind).toBe('replayed');
    });

    it('accepts a future queue-message-shaped input', async () => {
        repository.settleAgreement.mockResolvedValue(transitionedResult);

        const processor = new DefaultSettlementProcessor(repository);
        const input = buildSettlementProcessorInputFromMessage({
            agreementId: 'agr_123',
            idempotencyKey: 'idem_queue_1',
            requestId: 'req_queue_1',
            messageId: 'msg_1',
            triggerSource: 'queue_message',
            actorId: 'system_settlement_processor',
            actorType: 'merchant',
        });

        await processor.process(input);

        expect(repository.settleAgreement).toHaveBeenCalledWith(
            expect.objectContaining({
                agreementId: 'agr_123',
                idempotencyKey: 'idem_queue_1',
                requestId: 'req_queue_1',
                triggerSource: 'queue_message',
                messageId: 'msg_1',
            }),
        );
    });
});
