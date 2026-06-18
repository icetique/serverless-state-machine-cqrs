import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import {
    AwsEventBridgePublisher,
    getEventBusName,
    getEventPublisherMode,
    LocalLogPublisher,
    type DomainEvent,
} from '../../src/outbox/publisher';

describe('publisher helpers', () => {
    const sampleEvent: DomainEvent = {
        source: 'payments-example.agreements',
        detailType: 'AgreementFunded',
        detail: { agreementId: 'agr_123' },
    };

    beforeEach(() => {
        delete process.env.EVENT_PUBLISHER_MODE;
        delete process.env.EVENT_BUS_NAME;
    });

    it('logs local events in a structured form', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

        await new LocalLogPublisher().publish(sampleEvent);

        expect(logSpy).toHaveBeenCalledWith(
            JSON.stringify({
                message: 'AgreementFunded event published locally',
                event: sampleEvent,
            }),
        );
    });

    it('publishes events to EventBridge', async () => {
        const send: any = jest.fn(async () => undefined);
        const publisher = new AwsEventBridgePublisher({ send } as never, 'payments-bus');

        await publisher.publish(sampleEvent);

        expect(send).toHaveBeenCalledTimes(1);
        const command = send.mock.calls[0][0] as unknown as PutEventsCommand;
        expect(command).toBeInstanceOf(PutEventsCommand);
        expect(command.input).toEqual({
            Entries: [
                {
                    EventBusName: 'payments-bus',
                    Source: 'payments-example.agreements',
                    DetailType: 'AgreementFunded',
                    Detail: JSON.stringify({ agreementId: 'agr_123' }),
                },
            ],
        });
    });

    it('defaults the publisher mode to local and supports eventbridge', () => {
        expect(getEventPublisherMode()).toBe('local');

        process.env.EVENT_PUBLISHER_MODE = 'eventbridge';
        expect(getEventPublisherMode()).toBe('eventbridge');
    });

    it('rejects unsupported publisher modes', () => {
        process.env.EVENT_PUBLISHER_MODE = 'sns';

        expect(() => getEventPublisherMode()).toThrow('Unsupported EVENT_PUBLISHER_MODE: sns');
    });

    it('defaults the event bus name and respects overrides', () => {
        expect(getEventBusName()).toBe('default');

        process.env.EVENT_BUS_NAME = 'payments-bus';
        expect(getEventBusName()).toBe('payments-bus');
    });
});
