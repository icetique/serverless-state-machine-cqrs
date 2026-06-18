import { createHash, randomUUID } from 'crypto';
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { AgreementRepository, PostgresAgreementRepository } from './src/repository';
import {
    asHttpErrorResponse,
    assertMerchantOwnership,
    assertRole,
    createPool,
    getDatabaseUrl,
    getIdempotencyKey,
    jsonResponse,
    requireAuthContext,
    ValidationError,
} from './src/lambda-utils';

interface CreateAgreementRequest {
    merchantId: string;
    partnerId: string;
    amount: number;
}

const parseBody = (event: APIGatewayProxyEventV2WithJWTAuthorizer): CreateAgreementRequest => {
    if (!event.body) {
        throw new ValidationError('Request body is required');
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(event.body);
    } catch {
        throw new ValidationError('Request body must be valid JSON');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new ValidationError('Request body must be a JSON object');
    }

    const { merchantId, partnerId, amount } = parsed as Record<string, unknown>;

    if (typeof merchantId !== 'string' || merchantId.trim() === '') {
        throw new ValidationError('merchantId is required');
    }

    if (typeof partnerId !== 'string' || partnerId.trim() === '') {
        throw new ValidationError('partnerId is required');
    }

    if (merchantId === partnerId) {
        throw new ValidationError('merchantId and partnerId must be different');
    }

    if (typeof amount !== 'number' || Number.isNaN(amount)) {
        throw new ValidationError('amount is required');
    }

    if (amount <= 0) {
        throw new ValidationError('amount must be greater than zero');
    }

    return {
        merchantId,
        partnerId,
        amount,
    };
};

const hashCreateAgreementRequest = (request: CreateAgreementRequest): string =>
    createHash('sha256')
        .update(
            JSON.stringify({
                merchantId: request.merchantId,
                partnerId: request.partnerId,
                amount: request.amount,
            }),
        )
        .digest('hex');

export const createHandler = (repository: AgreementRepository) => {
    return async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const authContext = requireAuthContext(event);
            const request = parseBody(event);
            const idempotencyKey = getIdempotencyKey(event);
            assertRole(authContext, 'merchant', 'Only merchants may create agreements');
            assertMerchantOwnership(authContext, request.merchantId, 'Merchants may only create their own agreements');

            const result = await repository.createAgreement({
                publicId: `agr_${randomUUID()}`,
                merchantId: request.merchantId,
                partnerId: request.partnerId,
                amount: request.amount,
                idempotencyKey,
                requestHash: hashCreateAgreementRequest(request),
                requestId: event.requestContext.requestId ?? 'local-request',
                actorId: authContext.subject,
                actorType: authContext.role,
            });

            if (result.kind === 'conflict') {
                return jsonResponse(409, { message: 'Idempotency-Key reuse with different payload' });
            }

            if (result.kind === 'replayed') {
                return {
                    statusCode: result.responseStatusCode,
                    body: result.responseBody,
                };
            }

            return {
                statusCode: result.responseStatusCode,
                body: result.responseBody,
            };
        } catch (error) {
            const errorResponse = asHttpErrorResponse(error);

            if (errorResponse) {
                return errorResponse;
            }

            console.error(error);

            return jsonResponse(500, { message: 'Internal server error' });
        }
    };
};

let defaultHandler:
    | ((event: APIGatewayProxyEventV2WithJWTAuthorizer) => Promise<APIGatewayProxyStructuredResultV2>)
    | undefined;

const getDefaultHandler = () => {
    if (!defaultHandler) {
        const pool = createPool(getDatabaseUrl());
        const repository = new PostgresAgreementRepository(pool);
        defaultHandler = createHandler(repository);
    }

    return defaultHandler;
};

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => getDefaultHandler()(event);
