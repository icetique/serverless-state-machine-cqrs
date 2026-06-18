import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

export type EventPublisherMode = 'local' | 'eventbridge';

export interface DomainEvent {
    source: string;
    detailType: string;
    detail: unknown;
}

export interface EventPublisher {
    publish(event: DomainEvent): Promise<void>;
}

export class LocalLogPublisher implements EventPublisher {
    async publish(event: DomainEvent): Promise<void> {
        console.log(
            JSON.stringify({
                message: `${event.detailType} event published locally`,
                event,
            }),
        );
    }
}

export class AwsEventBridgePublisher implements EventPublisher {
    constructor(
        private readonly client: Pick<EventBridgeClient, 'send'>,
        private readonly eventBusName: string,
    ) {}

    async publish(event: DomainEvent): Promise<void> {
        await this.client.send(
            new PutEventsCommand({
                Entries: [
                    {
                        EventBusName: this.eventBusName,
                        Source: event.source,
                        DetailType: event.detailType,
                        Detail: JSON.stringify(event.detail),
                    },
                ],
            }),
        );
    }
}

export const getEventPublisherMode = (): EventPublisherMode => {
    const mode = process.env.EVENT_PUBLISHER_MODE ?? 'local';

    if (mode !== 'local' && mode !== 'eventbridge') {
        throw new Error(`Unsupported EVENT_PUBLISHER_MODE: ${mode}`);
    }

    return mode;
};

export const getEventBusName = (): string => process.env.EVENT_BUS_NAME ?? 'default';
