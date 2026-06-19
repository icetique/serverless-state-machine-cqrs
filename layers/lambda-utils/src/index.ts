import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResult } from 'aws-lambda';
import { Pool, type PoolConfig } from 'pg';

export {
    AGREEMENT_APPROVED_DETAIL_TYPE,
    AGREEMENT_CREATED_DETAIL_TYPE,
    AGREEMENT_EVENT_SOURCE,
    AGREEMENT_FUNDED_DETAIL_TYPE,
    AGREEMENT_SETTLED_DETAIL_TYPE,
    buildAgreementEvent,
    type AgreementDomainEvent,
    type AgreementEventDetail,
    type AgreementEventType,
    type AgreementStatus,
} from '@serverless-state-machine-cqrs/domain';

// Auth types — keep in sync with shared/auth-contract.ts
export type AuthRole = 'merchant' | 'partner' | 'admin';

export interface AuthContext {
    subject: string;
    role: AuthRole;
    merchantId?: string;
    partnerId?: string;
}

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}
export class ValidationError extends Error {}

const isSamLocal = (): boolean => process.env.AWS_SAM_LOCAL === 'true';

const getBearerToken = (event: { headers?: Record<string, string | undefined> }): string => {
    const headers = event.headers ?? {};
    const rawHeader = headers.Authorization ?? headers.authorization;

    if (!rawHeader || typeof rawHeader !== 'string') {
        throw new AuthenticationError('Authorization bearer token is required');
    }

    const [scheme, token] = rawHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        throw new AuthenticationError('Authorization header must use Bearer token format');
    }

    return token;
};

const parseClaimsFromBearerToken = (token: string): Record<string, unknown> => {
    const segments = token.split('.');

    if (segments.length < 2) {
        throw new AuthenticationError('JWT bearer token format is invalid');
    }

    try {
        const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new AuthenticationError('JWT bearer token payload is invalid');
        }

        return payload as Record<string, unknown>;
    } catch (error) {
        if (error instanceof AuthenticationError) {
            throw error;
        }

        throw new AuthenticationError('JWT bearer token payload is invalid');
    }
};

interface JwtClaims {
    sub?: string;
    app_role?: string;
    merchant_id?: string;
    partner_id?: string;
    [key: string]: unknown;
}

const getJwtClaims = (event: {
    requestContext?: { authorizer?: { jwt?: { claims?: JwtClaims } } };
    headers?: Record<string, string | undefined>;
}): JwtClaims => {
    const authorizerClaims = event.requestContext?.authorizer?.jwt?.claims;

    if (authorizerClaims && typeof authorizerClaims === 'object') {
        return authorizerClaims;
    }

    if (!isSamLocal()) {
        throw new AuthenticationError('JWT authorizer claims are required');
    }

    return parseClaimsFromBearerToken(getBearerToken(event)) as JwtClaims;
};

const buildAuthContextFromClaims = (claims: JwtClaims): AuthContext => {
    const subject = claims.sub;
    const role = claims.app_role;

    if (!subject || subject.trim() === '') {
        throw new AuthenticationError('JWT subject claim is required');
    }

    if (role !== 'merchant' && role !== 'partner' && role !== 'admin') {
        throw new AuthenticationError('JWT app_role claim is invalid');
    }

    const authContext: AuthContext = {
        subject,
        role,
    };

    if (role === 'merchant') {
        if (!claims.merchant_id || claims.merchant_id.trim() === '') {
            throw new AuthenticationError('JWT merchant_id claim is required for merchants');
        }

        authContext.merchantId = claims.merchant_id;
    }

    if (role === 'partner') {
        if (!claims.partner_id || claims.partner_id.trim() === '') {
            throw new AuthenticationError('JWT partner_id claim is required for partners');
        }

        authContext.partnerId = claims.partner_id;
    }

    return authContext;
};

export const requireAuthContext = (event: {
    requestContext?: { authorizer?: { jwt?: { claims?: JwtClaims } } };
    headers?: Record<string, string | undefined>;
}): AuthContext => buildAuthContextFromClaims(getJwtClaims(event));

export const assertRole = (authContext: AuthContext, expectedRole: AuthRole, message: string): void => {
    if (authContext.role !== expectedRole) {
        throw new AuthorizationError(message);
    }
};

export const assertMerchantOwnership = (authContext: AuthContext, merchantId: string, message: string): void => {
    if (authContext.merchantId !== merchantId) {
        throw new AuthorizationError(message);
    }
};

export const assertPartnerOwnership = (authContext: AuthContext, partnerId: string, message: string): void => {
    if (authContext.partnerId !== partnerId) {
        throw new AuthorizationError(message);
    }
};

export const jsonResponse = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
    statusCode,
    body: JSON.stringify(body),
});

export const parseLimit = (
    event: { queryStringParameters?: Record<string, string | undefined> | null },
    options?: { default?: number; max?: number },
): number => {
    const defaultLimit = options?.default ?? 50;
    const maxLimit = options?.max ?? 200;
    const rawLimit = event.queryStringParameters?.limit;

    if (!rawLimit) {
        return defaultLimit;
    }

    const parsed = Number(rawLimit);

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maxLimit) {
        throw new ValidationError(`limit must be an integer between 1 and ${maxLimit}`);
    }

    return parsed;
};

export const asHttpErrorResponse = (error: unknown): APIGatewayProxyResult | null => {
    if (error instanceof ValidationError) {
        return jsonResponse(400, { message: error.message });
    }

    if (error instanceof AuthenticationError) {
        return jsonResponse(401, { message: error.message });
    }

    if (error instanceof AuthorizationError) {
        return jsonResponse(403, { message: error.message });
    }

    return null;
};

export const getDatabaseUrl = (): string => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required');
    }

    return databaseUrl;
};

export const createPool = (connectionString: string): Pool => {
    const config: PoolConfig = {
        connectionString,
        max: 1,
    };

    return new Pool(config);
};

export interface QueryResult<Row> {
    rows: Row[];
}

export interface Queryable {
    query<Row>(text: string, values: unknown[]): Promise<QueryResult<Row>>;
}

export interface TransactionalQueryable extends Queryable {
    release(): void;
}

export interface TransactionPool {
    connect(): Promise<TransactionalQueryable>;
}

export const getIdempotencyKey = (event: APIGatewayProxyEventV2WithJWTAuthorizer): string => {
    const headers = event.headers ?? {};
    const key = headers['Idempotency-Key'] ?? headers['idempotency-key'];

    if (!key || key.trim() === '') {
        throw new ValidationError('Idempotency-Key header is required');
    }

    return key;
};
