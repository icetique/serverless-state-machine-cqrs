import { createHash } from 'crypto';
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { AgreementRepository, AgreementLookup, PostgresAgreementRepository } from '../../src/repository';
import {
    asHttpErrorResponse,
    assertMerchantOwnership,
    assertPartnerOwnership,
    assertRole,
    createPool,
    getDatabaseUrl,
    getIdempotencyKey,
    jsonResponse,
    requireAuthContext,
    type AgreementEventType,
    type AgreementStatus,
    ValidationError,
} from '../../src/lambda-utils';
import { DefaultSettlementProcessor, SettlementProcessor } from '../../src/settlement/settlement-processor';
import { withHttpFailureSimulation } from '../../src/dev-failure-simulation';

class ManualSettlementTriggerDisabledError extends Error {}

interface TransitionConfig {
    eventType: AgreementEventType;
    expectedCurrentStatus: AgreementStatus;
    nextStatus: AgreementStatus;
}

const getTransitionConfig = (): TransitionConfig => {
    const eventType = process.env.TRANSITION_EVENT_TYPE as AgreementEventType | undefined;
    const expectedCurrentStatus = process.env.EXPECTED_CURRENT_STATUS as AgreementStatus | undefined;
    const nextStatus = process.env.NEXT_STATUS as AgreementStatus | undefined;

    if (!eventType || !expectedCurrentStatus || !nextStatus) {
        throw new Error('Transition environment is not configured');
    }

    return {
        eventType,
        expectedCurrentStatus,
        nextStatus,
    };
};

const getAgreementId = (event: APIGatewayProxyEventV2WithJWTAuthorizer): string => {
    const agreementId = event.pathParameters?.agreementId;

    if (!agreementId || agreementId.trim() === '') {
        throw new ValidationError('agreementId path parameter is required');
    }

    return agreementId;
};

const hashTransitionRequest = (agreementId: string, eventType: AgreementEventType): string =>
    createHash('sha256').update(JSON.stringify({ agreementId, eventType })).digest('hex');

const isManualSettlementTriggerEnabled = (): boolean => process.env.ENABLE_MANUAL_SETTLEMENT_TRIGGER === 'true';

const getMerchantTransitionVerb = (eventType: AgreementEventType): string => {
    if (eventType === 'AgreementFunded') {
        return 'fund';
    }

    return 'settle';
};

const authorizeTransition = (
    authContext: ReturnType<typeof requireAuthContext>,
    agreement: AgreementLookup,
    transitionConfig: TransitionConfig,
): void => {
    if (transitionConfig.eventType === 'AgreementApproved') {
        assertRole(authContext, 'partner', 'Only partners may approve agreements');
        assertPartnerOwnership(authContext, agreement.partnerId, 'Partners may only approve their own agreements');
        return;
    }

    const verb = getMerchantTransitionVerb(transitionConfig.eventType);
    assertRole(authContext, 'merchant', `Only merchants may ${verb} agreements`);
    assertMerchantOwnership(authContext, agreement.merchantId, `Merchants may only ${verb} their own agreements`);
};

export const createHandler = (
    repository: AgreementRepository,
    transitionConfig: TransitionConfig,
    settlementProcessor: SettlementProcessor = new DefaultSettlementProcessor(repository),
) => {
    return async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const agreementId = getAgreementId(event);
            const idempotencyKey = getIdempotencyKey(event);
            const authContext = requireAuthContext(event);
            const agreement = await repository.findAgreementByPublicId(agreementId);

            if (!agreement) {
                return jsonResponse(404, { message: 'Agreement not found' });
            }

            authorizeTransition(authContext, agreement, transitionConfig);
            if (transitionConfig.eventType === 'AgreementSettled' && !isManualSettlementTriggerEnabled()) {
                throw new ManualSettlementTriggerDisabledError('Manual settlement trigger is disabled');
            }

            const result =
                transitionConfig.eventType === 'AgreementSettled'
                    ? await settlementProcessor.process({
                          agreementId,
                          idempotencyKey,
                          requestId: event.requestContext.requestId ?? 'local-request',
                          triggerSource: 'http_manual',
                          actorId: authContext.subject,
                          actorType: authContext.role,
                      })
                    : await repository.transitionAgreement({
                          agreementId,
                          expectedCurrentStatus: transitionConfig.expectedCurrentStatus,
                          nextStatus: transitionConfig.nextStatus,
                          eventType: transitionConfig.eventType,
                          idempotencyKey,
                          requestHash: hashTransitionRequest(agreementId, transitionConfig.eventType),
                          requestId: event.requestContext.requestId ?? 'local-request',
                          actorId: authContext.subject,
                          actorType: authContext.role,
                      });

            if (result.kind === 'conflict') {
                return jsonResponse(409, { message: 'Idempotency-Key reuse with different payload' });
            }

            if (result.kind === 'not_found') {
                return jsonResponse(404, { message: 'Agreement not found' });
            }

            if (result.kind === 'invalid_transition') {
                return jsonResponse(409, {
                    message: `Invalid transition from ${result.currentStatus} to ${transitionConfig.nextStatus}`,
                });
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

            if (error instanceof ManualSettlementTriggerDisabledError) {
                return jsonResponse(403, { message: error.message });
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
        const repository = new PostgresAgreementRepository(createPool(getDatabaseUrl()));
        defaultHandler = withHttpFailureSimulation(createHandler(repository, getTransitionConfig()));
    }

    return defaultHandler;
};

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => getDefaultHandler()(event);
