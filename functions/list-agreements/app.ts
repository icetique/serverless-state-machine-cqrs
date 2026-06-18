import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { AgreementsRepository, PostgresAgreementsRepository } from './src/repository';
import {
    asHttpErrorResponse,
    createPool,
    getDatabaseUrl,
    jsonResponse,
    parseLimit,
    requireAuthContext,
} from './src/lambda-utils';

export const createHandler = (repository: AgreementsRepository) => {
    return async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const authContext = requireAuthContext(event);
            const agreements = await repository.listAgreements({
                limit: parseLimit(event),
                role: authContext.role,
                merchantId: authContext.merchantId,
                partnerId: authContext.partnerId,
            });
            return jsonResponse(200, { agreements });
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
        const repository = new PostgresAgreementsRepository(pool);
        defaultHandler = createHandler(repository);
    }

    return defaultHandler;
};

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => getDefaultHandler()(event);
