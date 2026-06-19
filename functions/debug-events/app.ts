import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { EventStreamReadRepository, PostgresEventStreamReadRepository } from './src/repository';
import {
    asHttpErrorResponse,
    assertRole,
    createPool,
    getDatabaseUrl,
    jsonResponse,
    parseLimit,
    requireAuthContext,
} from './src/lambda-utils';

export const createHandler = (repository: EventStreamReadRepository) => {
    return async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const authContext = requireAuthContext(event);
            assertRole(authContext, 'admin', 'Only admins may inspect persisted events');
            const limit = parseLimit(event);
            const agreementId = event.queryStringParameters?.agreementId;
            const events = await repository.listEvents({
                limit,
                agreementId: agreementId && agreementId.trim() !== '' ? agreementId : undefined,
            });

            return jsonResponse(200, { events });
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
        const repository = new PostgresEventStreamReadRepository(pool);
        defaultHandler = createHandler(repository);
    }

    return defaultHandler;
};

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => getDefaultHandler()(event);
