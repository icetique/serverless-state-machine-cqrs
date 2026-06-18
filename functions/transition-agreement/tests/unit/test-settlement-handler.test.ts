import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SQSEvent } from 'aws-lambda';
import { createHandler } from '../../handlers/settlement/settlement-handler';
import { SettlementProcessor } from '../../src/settlement/settlement-processor';

const createDirectMessageEvent = (): SQSEvent =>
    ({
        Records: [
            {
                messageId: 'msg_1',
                body: JSON.stringify({
                    agreementId: 'agr_123',
                    idempotencyKey: 'idem_1',
                    requestId: 'req_1',
                    triggerSource: 'manual_queue_test',
                    actorId: 'settlement_processor',
                    actorType: 'system',
                }),
            },
        ],
    }) as unknown as SQSEvent;

const createFundedEnvelopeEvent = (): SQSEvent =>
    ({
        Records: [
            {
                messageId: 'msg_evt_1',
                body: JSON.stringify({
                    id: 'evt_1',
                    source: 'payments-example.agreements',
                    'detail-type': 'AgreementFunded',
                    detail: {
                        agreementId: 'agr_123',
                        merchantId: 'merchant_1',
                        partnerId: 'partner_2',
                        amount: 1000,
                        previousStatus: 'APPROVED',
                        newStatus: 'FUNDED',
                    },
                }),
            },
        ],
    }) as unknown as SQSEvent;

describe('Settlement handler', () => {
    const processor: jest.Mocked<SettlementProcessor> = {
        process: jest.fn(),
    };

    const mockProcessSuccess = () => {
        processor.process.mockResolvedValue({
            kind: 'replayed',
            responseStatusCode: 200,
            responseBody: '{}',
        });
    };

    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('processes a direct settlement queue message', async () => {
        mockProcessSuccess();

        const result = await createHandler(processor)(createDirectMessageEvent());

        expect(result).toEqual({ batchItemFailures: [] });
        expect(processor.process).toHaveBeenCalledWith({
            agreementId: 'agr_123',
            idempotencyKey: 'idem_1',
            requestId: 'req_1',
            triggerSource: 'manual_queue_test',
            actorId: 'settlement_processor',
            actorType: 'system',
            messageId: 'msg_1',
        });
    });

    it('processes an AgreementFunded EventBridge envelope from SQS', async () => {
        mockProcessSuccess();

        const result = await createHandler(processor)(createFundedEnvelopeEvent());

        expect(result).toEqual({ batchItemFailures: [] });
        expect(processor.process).toHaveBeenCalledWith({
            agreementId: 'agr_123',
            idempotencyKey: 'evt_evt_1',
            requestId: 'evt_1',
            triggerSource: 'eventbridge_agreement_funded',
            actorId: 'settlement_processor',
            actorType: 'system',
            messageId: 'evt_1',
        });
    });

    it('returns a batch failure for unsupported message bodies', async () => {
        const result = await createHandler(processor)({
            Records: [
                {
                    messageId: 'bad_1',
                    body: JSON.stringify({ nope: true }),
                },
            ],
        } as unknown as SQSEvent);

        expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'bad_1' }] });
        expect(processor.process).not.toHaveBeenCalled();
    });
});
