import type {
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyStructuredResultV2,
    SQSEvent,
    SQSBatchResponse,
} from 'aws-lambda';
import { jsonResponse } from './lambda-utils';

export const SIMULATE_HTTP_CRASH_HEADER = 'X-Debug-Simulate-Post-Commit-Crash';
export const SIMULATE_SQS_CRASH_ATTRIBUTE = 'X-Simulate-Post-Commit-Crash';

const CRASH_FLAG_VALUES = ['1', 'true'] as const;

const isFailureSimulationEnabled = (): boolean => process.env.ENABLE_DEV_FAILURE_SIMULATION === 'true';

const isCrashFlagged = (value: string | undefined): boolean =>
    value !== undefined && (CRASH_FLAG_VALUES as readonly string[]).includes(value);

export const withHttpFailureSimulation = (
    handler: (event: APIGatewayProxyEventV2WithJWTAuthorizer) => Promise<APIGatewayProxyStructuredResultV2>,
): ((event: APIGatewayProxyEventV2WithJWTAuthorizer) => Promise<APIGatewayProxyStructuredResultV2>) => {
    return async (event) => {
        if (!isFailureSimulationEnabled()) {
            return handler(event);
        }

        const result = await handler(event);

        if (result.statusCode !== 200) {
            return result;
        }

        const headers = event.headers ?? {};
        const flag = headers[SIMULATE_HTTP_CRASH_HEADER] ?? headers[SIMULATE_HTTP_CRASH_HEADER.toLowerCase()];
        if (!isCrashFlagged(flag)) {
            return result;
        }

        // Only settlement responses contain a transactionId
        if (typeof result.body !== 'string' || !result.body.includes('transactionId')) {
            return result;
        }

        console.error('Simulated post-commit crash after settlement success');
        return jsonResponse(500, { message: 'Simulated post-commit crash after settlement success' });
    };
};

export const withSqsFailureSimulation = (
    handler: (event: SQSEvent) => Promise<SQSBatchResponse>,
): ((event: SQSEvent) => Promise<SQSBatchResponse>) => {
    return async (event) => {
        if (!isFailureSimulationEnabled()) {
            return handler(event);
        }

        const result = await handler(event);

        for (const record of event.Records) {
            const attrs = record.messageAttributes ?? {};
            const flag = attrs[SIMULATE_SQS_CRASH_ATTRIBUTE]?.stringValue ?? '';
            if (isCrashFlagged(flag)) {
                console.error(`Simulated post-commit crash after settlement success for message ${record.messageId}`);
                result.batchItemFailures.push({ itemIdentifier: record.messageId });
            }
        }

        return result;
    };
};
