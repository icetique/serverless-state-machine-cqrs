import { createHash } from 'crypto';
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
    assertTransitionConfig,
    authorizeTransition,
    DomainAuthorizationError,
    type AgreementEventType,
    type AgreementStatus,
} from '@serverless-state-machine-cqrs/domain';
import { AgreementCommandRepository, PostgresAgreementCommandRepository } from '../../src/repository';
import {
    asHttpErrorResponse,
    createPool,
    getDatabaseUrl,
    getIdempotencyKey,
    jsonResponse,
    requireAuthContext,
    ValidationError,
} from '../../src/lambda-utils';
import { DefaultSettlementProcessor, SettlementProcessor } from '../../src/settlement/settlement-processor';
import { mapTransitionAgreementResult } from '../../src/map-command-result';
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

    assertTransitionConfig(eventType, expectedCurrentStatus, nextStatus);

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

export const createHandler = (
    repository: AgreementCommandRepository,
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

            authorizeTransition(authContext, agreement, transitionConfig.eventType);

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
                    : await (async () => {
                          const { eventType } = transitionConfig;
                          if (eventType !== 'AgreementApproved' && eventType !== 'AgreementFunded') {
                              throw new Error(`Unsupported HTTP transition event type: ${eventType}`);
                          }

                          return repository.transitionAgreement({
                              agreementId,
                              eventType,
                              idempotencyKey,
                              requestHash: hashTransitionRequest(agreementId, eventType),
                              requestId: event.requestContext.requestId ?? 'local-request',
                              actorId: authContext.subject,
                              actorType: authContext.role,
                          });
                      })();

            return mapTransitionAgreementResult(result, transitionConfig.nextStatus);
        } catch (error) {
            const errorResponse = asHttpErrorResponse(error);

            if (errorResponse) {
                return errorResponse;
            }

            if (error instanceof DomainAuthorizationError) {
                return jsonResponse(403, { message: error.message });
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
        const repository = new PostgresAgreementCommandRepository(createPool(getDatabaseUrl()));
        defaultHandler = withHttpFailureSimulation(createHandler(repository, getTransitionConfig()));
    }

    return defaultHandler;
};

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => getDefaultHandler()(event);
