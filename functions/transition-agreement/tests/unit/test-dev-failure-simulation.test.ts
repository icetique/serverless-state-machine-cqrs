import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyStructuredResultV2,
    SQSEvent,
    SQSBatchResponse,
} from 'aws-lambda';
import {
    SIMULATE_HTTP_CRASH_HEADER,
    SIMULATE_SQS_CRASH_ATTRIBUTE,
    withHttpFailureSimulation,
    withSqsFailureSimulation,
} from '../../src/dev-failure-simulation';
import { jsonResponse } from '../../src/lambda-utils';

// ---------------------------------------------------------------------------
// HTTP decorator tests
// ---------------------------------------------------------------------------

describe('withHttpFailureSimulation', () => {
    const happyHandler =
        jest.fn<(event: APIGatewayProxyEventV2WithJWTAuthorizer) => Promise<APIGatewayProxyStructuredResultV2>>();
    const CRASH_KEY = 'ENABLE_DEV_FAILURE_SIMULATION';
    let previousEnv: string | undefined;

    beforeEach(() => {
        previousEnv = process.env[CRASH_KEY];
    });

    afterEach(() => {
        process.env[CRASH_KEY] = previousEnv;
        jest.restoreAllMocks();
    });

    const settlementResponse = (statusCode: number, includeTransactionId?: boolean) =>
        jsonResponse(statusCode, {
            agreementId: 'agr_123',
            status: 'SETTLED',
            ...(includeTransactionId ? { transactionId: 'txn_abc' } : {}),
        });

    it('delegates to the raw handler when the env var is not set', async () => {
        process.env[CRASH_KEY] = 'false';
        happyHandler.mockResolvedValue(jsonResponse(200, { ok: true }));

        const wrapped = withHttpFailureSimulation(happyHandler);
        const result = await wrapped({ headers: {} } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer);

        expect(result.statusCode).toBe(200);
        expect(happyHandler).toHaveBeenCalledTimes(1);
    });

    it('returns the handler result when no crash header is present', async () => {
        process.env[CRASH_KEY] = 'true';
        happyHandler.mockResolvedValue(settlementResponse(200, true));

        const wrapped = withHttpFailureSimulation(happyHandler);
        const result = await wrapped({ headers: {} } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer);

        expect(result.statusCode).toBe(200);
        expect(result.body).toContain('transactionId');
    });

    it('returns 500 when the crash header is present on a settlement 200', async () => {
        process.env[CRASH_KEY] = 'true';
        happyHandler.mockResolvedValue(settlementResponse(200, true));

        const wrapped = withHttpFailureSimulation(happyHandler);
        const result = await wrapped({
            headers: { [SIMULATE_HTTP_CRASH_HEADER]: '1' },
        } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer);

        expect(result.statusCode).toBe(500);
        expect(result.body).toContain('Simulated post-commit crash after settlement success');
        expect(happyHandler).toHaveBeenCalled();
    });

    it('does not replace non-200 responses even with the crash header', async () => {
        process.env[CRASH_KEY] = 'true';
        happyHandler.mockResolvedValue(settlementResponse(404));

        const wrapped = withHttpFailureSimulation(happyHandler);
        const result = await wrapped({
            headers: { [SIMULATE_HTTP_CRASH_HEADER]: '1' },
        } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer);

        expect(result.statusCode).toBe(404);
    });

    it('does not replace 200 responses that are not settlement (no transactionId)', async () => {
        process.env[CRASH_KEY] = 'true';
        happyHandler.mockResolvedValue(settlementResponse(200, false));

        const wrapped = withHttpFailureSimulation(happyHandler);
        const result = await wrapped({
            headers: { [SIMULATE_HTTP_CRASH_HEADER]: '1' },
        } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer);

        expect(result.statusCode).toBe(200);
        expect(result.body).not.toContain('transactionId');
    });
});
// ---------------------------------------------------------------------------
// SQS decorator tests
// ---------------------------------------------------------------------------

describe('withSqsFailureSimulation', () => {
    const happyHandler = jest.fn<(event: SQSEvent) => Promise<SQSBatchResponse>>();
    const CRASH_KEY = 'ENABLE_DEV_FAILURE_SIMULATION';
    let previousEnv: string | undefined;

    beforeEach(() => {
        previousEnv = process.env[CRASH_KEY];
        happyHandler.mockResolvedValue({ batchItemFailures: [] });
    });

    afterEach(() => {
        process.env[CRASH_KEY] = previousEnv;
        jest.restoreAllMocks();
    });

    it('delegates to the raw handler when the env var is not set', async () => {
        process.env[CRASH_KEY] = 'false';

        const wrapped = withSqsFailureSimulation(happyHandler);
        const result = await wrapped({
            Records: [{ messageId: 'any', messageAttributes: {} }],
        } as unknown as SQSEvent);

        expect(result).toEqual({ batchItemFailures: [] });
        expect(happyHandler).toHaveBeenCalledTimes(1);
    });

    it('adds a batch item failure when the crash attribute is present', async () => {
        process.env[CRASH_KEY] = 'true';

        const wrapped = withSqsFailureSimulation(happyHandler);
        const result = await wrapped({
            Records: [
                {
                    messageId: 'crash_1',
                    messageAttributes: {
                        [SIMULATE_SQS_CRASH_ATTRIBUTE]: {
                            stringValue: '1',
                            dataType: 'String',
                        },
                    },
                },
            ],
        } as unknown as SQSEvent);

        expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'crash_1' }] });
        expect(happyHandler).toHaveBeenCalled();
    });

    it('passes through when no crash attribute is present', async () => {
        process.env[CRASH_KEY] = 'true';

        const wrapped = withSqsFailureSimulation(happyHandler);
        const result = await wrapped({
            Records: [
                {
                    messageId: 'normal_1',
                    messageAttributes: {},
                },
            ],
        } as unknown as SQSEvent);

        expect(result).toEqual({ batchItemFailures: [] });
    });

    it('only fails the crashing record in a mixed batch', async () => {
        process.env[CRASH_KEY] = 'true';

        const wrapped = withSqsFailureSimulation(happyHandler);
        const result = await wrapped({
            Records: [
                {
                    messageId: 'normal_1',
                    messageAttributes: {},
                },
                {
                    messageId: 'crash_1',
                    messageAttributes: {
                        [SIMULATE_SQS_CRASH_ATTRIBUTE]: {
                            stringValue: '1',
                            dataType: 'String',
                        },
                    },
                },
                {
                    messageId: 'normal_2',
                    messageAttributes: {},
                },
            ],
        } as unknown as SQSEvent);

        expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'crash_1' }] });
    });
});
