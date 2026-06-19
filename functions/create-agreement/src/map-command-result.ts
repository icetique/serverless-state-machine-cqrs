import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { CreateAgreementResult } from '@serverless-state-machine-cqrs/persistence';
import { jsonResponse } from './lambda-utils';

export const mapCreateAgreementResult = (
    result: CreateAgreementResult,
): APIGatewayProxyStructuredResultV2 => {
    if (result.kind === 'conflict') {
        return jsonResponse(409, { message: 'Idempotency-Key reuse with different payload' });
    }

    if (result.kind === 'replayed' || result.kind === 'created') {
        return jsonResponse(201, result.agreement);
    }

    return jsonResponse(500, { message: 'Internal server error' });
};
