import { ScheduledEvent } from 'aws-lambda';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import {
    AwsEventBridgePublisher,
    EventPublisher,
    LocalLogPublisher,
    getEventBusName,
    getEventPublisherMode,
} from '../../src/outbox/publisher';
import { PostgresOutboxRepository, OutboxRepository } from '../../src/outbox/outbox-repository';
import { createPool, getDatabaseUrl } from '../../src/lambda-utils';

const DEFAULT_BATCH_SIZE = 20;

export const getBatchSize = (): number => {
    const raw = process.env.OUTBOX_DISPATCH_BATCH_SIZE;

    if (!raw) {
        return DEFAULT_BATCH_SIZE;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('OUTBOX_DISPATCH_BATCH_SIZE must be a positive integer');
    }

    return parsed;
};

export const createPublisher = (): EventPublisher => {
    const mode = getEventPublisherMode();

    if (mode === 'eventbridge') {
        return new AwsEventBridgePublisher(new EventBridgeClient({}), getEventBusName());
    }

    return new LocalLogPublisher();
};

export const createHandler = (
    repository: OutboxRepository,
    publisher: EventPublisher,
    batchSize = DEFAULT_BATCH_SIZE,
) => {
    return async (_event: ScheduledEvent): Promise<{ processed: number; published: number; failed: number }> => {
        const pendingEvents = await repository.claimPendingEvents(batchSize);
        let published = 0;
        let failed = 0;

        for (const outboxEvent of pendingEvents) {
            try {
                await publisher.publish({
                    source: outboxEvent.eventSource,
                    detailType: outboxEvent.eventType,
                    detail: outboxEvent.payload,
                });
                await repository.markPublished(outboxEvent.id);
                published += 1;
            } catch (error) {
                console.error(error);
                await repository.markFailed(
                    outboxEvent.id,
                    error instanceof Error ? error.message : 'Unknown outbox publish error',
                );
                failed += 1;
            }
        }

        return {
            processed: pendingEvents.length,
            published,
            failed,
        };
    };
};

let defaultHandler:
    | ((event: ScheduledEvent) => Promise<{ processed: number; published: number; failed: number }>)
    | undefined;

const getDefaultHandler = () => {
    if (!defaultHandler) {
        const repository = new PostgresOutboxRepository(createPool(getDatabaseUrl()));
        defaultHandler = createHandler(repository, createPublisher(), getBatchSize());
    }

    return defaultHandler;
};

export const lambdaHandler = async (
    event: ScheduledEvent,
): Promise<{ processed: number; published: number; failed: number }> => getDefaultHandler()(event);
