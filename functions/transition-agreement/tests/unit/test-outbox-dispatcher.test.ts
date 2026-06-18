import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ScheduledEvent } from 'aws-lambda';
import { createHandler, createPublisher, getBatchSize } from '../../handlers/outbox/outbox-dispatcher';
import { EventPublisher } from '../../src/outbox/publisher';
import { OutboxRepository } from '../../src/outbox/outbox-repository';

const publisherModule = jest.requireActual('../../src/outbox/publisher') as typeof import('../../src/outbox/publisher');

describe('Outbox dispatcher', () => {
    const repository: jest.Mocked<OutboxRepository> = {
        claimPendingEvents: jest.fn(),
        markPublished: jest.fn(),
        markFailed: jest.fn(),
    };
    const publisher: jest.Mocked<EventPublisher> = {
        publish: jest.fn(),
    };

    beforeEach(() => {
        delete process.env.EVENT_PUBLISHER_MODE;
        delete process.env.OUTBOX_DISPATCH_BATCH_SIZE;
        repository.claimPendingEvents.mockReset();
        repository.markPublished.mockReset();
        repository.markFailed.mockReset();
        publisher.publish.mockReset();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('publishes pending outbox rows and marks them published', async () => {
        repository.claimPendingEvents.mockResolvedValue([
            {
                id: 1,
                eventSource: 'payments-example.agreements',
                eventType: 'AgreementFunded',
                payload: { agreementId: 'agr_123' },
                attemptCount: 1,
            },
        ]);

        const result = await createHandler(repository, publisher, 10)({} as ScheduledEvent);

        expect(result).toEqual({ processed: 1, published: 1, failed: 0 });
        expect(publisher.publish).toHaveBeenCalledWith({
            source: 'payments-example.agreements',
            detailType: 'AgreementFunded',
            detail: { agreementId: 'agr_123' },
        });
        expect(repository.markPublished).toHaveBeenCalledWith(1);
        expect(repository.markFailed).not.toHaveBeenCalled();
    });

    it('marks failed rows and continues processing the batch', async () => {
        repository.claimPendingEvents.mockResolvedValue([
            {
                id: 1,
                eventSource: 'payments-example.agreements',
                eventType: 'AgreementFunded',
                payload: { agreementId: 'agr_123' },
                attemptCount: 1,
            },
            {
                id: 2,
                eventSource: 'payments-example.agreements',
                eventType: 'AgreementSettled',
                payload: { agreementId: 'agr_456' },
                attemptCount: 3,
            },
        ]);
        publisher.publish.mockRejectedValueOnce(new Error('eventbridge down')).mockResolvedValueOnce(undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await createHandler(repository, publisher, 10)({} as ScheduledEvent);

        expect(result).toEqual({ processed: 2, published: 1, failed: 1 });
        expect(repository.markFailed).toHaveBeenCalledWith(1, 'eventbridge down');
        expect(repository.markPublished).toHaveBeenCalledWith(2);
    });

    it('treats non-Error failures as unknown outbox publish errors', async () => {
        repository.claimPendingEvents.mockResolvedValue([
            {
                id: 1,
                eventSource: 'payments-example.agreements',
                eventType: 'AgreementFunded',
                payload: { agreementId: 'agr_123' },
                attemptCount: 1,
            },
        ]);
        publisher.publish.mockRejectedValueOnce('boom');
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await createHandler(repository, publisher, 10)({} as ScheduledEvent);

        expect(result).toEqual({ processed: 1, published: 0, failed: 1 });
        expect(repository.markFailed).toHaveBeenCalledWith(1, 'Unknown outbox publish error');
    });

    it('creates a local publisher by default', () => {
        const localPublisher = createPublisher();

        expect(localPublisher).toBeInstanceOf(publisherModule.LocalLogPublisher);
    });

    it('creates an EventBridge publisher when configured', () => {
        process.env.EVENT_PUBLISHER_MODE = 'eventbridge';

        const eventBridgePublisher = createPublisher();

        expect(eventBridgePublisher).toBeInstanceOf(publisherModule.AwsEventBridgePublisher);
    });

    it('uses the default batch size when the env var is absent', () => {
        expect(getBatchSize()).toBe(20);
    });

    it('uses the configured batch size when the env var is valid', () => {
        process.env.OUTBOX_DISPATCH_BATCH_SIZE = '7';

        expect(getBatchSize()).toBe(7);
    });

    it('rejects invalid batch size configuration', () => {
        process.env.OUTBOX_DISPATCH_BATCH_SIZE = '0';

        expect(() => getBatchSize()).toThrow('OUTBOX_DISPATCH_BATCH_SIZE must be a positive integer');
    });
});
