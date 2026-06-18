import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHandler } from '../../app';
import { DebugEventsRepository } from '../../src/repository';
import { TEST_JWT_CLAIMS, asJwtHandlerEvent, createHttpApiEvent } from '../../../../tests/fixtures/http-api/http-api';

const createEvent = (queryStringParameters?: Record<string, string>, claims = TEST_JWT_CLAIMS.admin) =>
    createHttpApiEvent({
        queryStringParameters: queryStringParameters ?? null,
        claims,
    });

const parseBody = (body: string | undefined) => JSON.parse(body ?? '{}');

describe('Debug events handler', () => {
    const repository: jest.Mocked<DebugEventsRepository> = {
        listEvents: jest.fn(),
    };

    beforeEach(() => {
        repository.listEvents.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns events ordered from the repository', async () => {
        repository.listEvents.mockResolvedValue([
            {
                id: 10,
                agreementId: 'agr_123',
                eventType: 'AgreementCreated',
                previousStatus: null,
                newStatus: 'CREATED',
                requestId: 'req_1',
                idempotencyKey: 'idem_1',
                payload: { agreementId: 'agr_123' },
                createdAt: '2026-06-04T11:00:00.000Z',
            },
        ]);

        const handler = createHandler(repository);
        const result = await handler(createEvent({ limit: '10', agreementId: 'agr_123' }));

        expect(result.statusCode).toBe(200);
        expect(repository.listEvents).toHaveBeenCalledWith({ limit: 10, agreementId: 'agr_123' });
        expect(parseBody(result.body)).toEqual({
            events: [
                {
                    id: 10,
                    agreementId: 'agr_123',
                    eventType: 'AgreementCreated',
                    previousStatus: null,
                    newStatus: 'CREATED',
                    requestId: 'req_1',
                    idempotencyKey: 'idem_1',
                    payload: { agreementId: 'agr_123' },
                    createdAt: '2026-06-04T11:00:00.000Z',
                },
            ],
        });
    });

    it('defaults the limit to 50', async () => {
        repository.listEvents.mockResolvedValue([]);

        const handler = createHandler(repository);
        const result = await handler(createEvent());

        expect(result.statusCode).toBe(200);
        expect(repository.listEvents).toHaveBeenCalledWith({ limit: 50, agreementId: undefined });
    });

    it('returns 400 for invalid limit', async () => {
        const handler = createHandler(repository);
        const result = await handler(createEvent({ limit: '0' }));

        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toEqual({ message: 'limit must be an integer between 1 and 200' });
    });

    it('returns 403 for non-admin callers', async () => {
        const handler = createHandler(repository);
        const result = await handler(createEvent(undefined, TEST_JWT_CLAIMS.merchant));

        expect(result.statusCode).toBe(403);
        expect(parseBody(result.body)).toEqual({ message: 'Only admins may inspect persisted events' });
    });

    it('returns 401 when no auth context is available', async () => {
        const handler = createHandler(repository);
        const result = await handler(asJwtHandlerEvent(createHttpApiEvent()));

        expect(result.statusCode).toBe(401);
        expect(parseBody(result.body)).toEqual({ message: 'JWT authorizer claims are required' });
    });
});
