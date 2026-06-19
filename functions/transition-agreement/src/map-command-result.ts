import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { AgreementStatus } from '@serverless-state-machine-cqrs/domain';
import type { TransitionAgreementResult } from '@serverless-state-machine-cqrs/persistence';
import { jsonResponse } from './lambda-utils';

export const mapTransitionAgreementResult = (
    result: TransitionAgreementResult,
    targetStatus: AgreementStatus,
): APIGatewayProxyStructuredResultV2 => {
    if (result.kind === 'conflict') {
        return jsonResponse(409, { message: 'Idempotency-Key reuse with different payload' });
    }

    if (result.kind === 'not_found') {
        return jsonResponse(404, { message: 'Agreement not found' });
    }

    if (result.kind === 'invalid_transition') {
        return jsonResponse(409, {
            message: `Invalid transition from ${result.currentStatus} to ${targetStatus}`,
        });
    }

    if (result.kind === 'replayed' || result.kind === 'transitioned') {
        return jsonResponse(200, result.payload);
    }

    return jsonResponse(500, { message: 'Internal server error' });
};
