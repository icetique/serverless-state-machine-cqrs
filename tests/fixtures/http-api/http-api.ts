import type {
    APIGatewayEventRequestContextJWTAuthorizer,
    APIGatewayEventRequestContextV2,
    APIGatewayProxyEventV2,
    APIGatewayProxyEventV2WithJWTAuthorizer,
} from 'aws-lambda';

export type TestAuthRole = 'merchant' | 'partner' | 'admin';

export interface TestJwtClaims {
    sub: string;
    app_role: TestAuthRole;
    merchant_id?: string;
    partner_id?: string;
    email?: string;
}

export const TEST_JWT_CLAIMS: Record<TestAuthRole, TestJwtClaims> = {
    merchant: {
        sub: 'supabase-user-merchant-1',
        app_role: 'merchant',
        merchant_id: 'merchant_1',
        email: 'merchant_1@example.com',
    },
    partner: {
        sub: 'supabase-user-partner-2',
        app_role: 'partner',
        partner_id: 'partner_2',
        email: 'partner_2@example.com',
    },
    admin: {
        sub: 'supabase-user-admin-1',
        app_role: 'admin',
        email: 'admin_1@example.com',
    },
};

export type TestHttpApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;

export const createUnsignedJwt = (claims: TestJwtClaims): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');

    return `${header}.${payload}.`;
};

interface CreateHttpApiEventOptions {
    token?: string;
    body?: string | null;
    headers?: Record<string, string>;
    pathParameters?: Record<string, string> | null;
    queryStringParameters?: Record<string, string> | null;
    requestId?: string;
}

type CreateHttpApiEventWithClaimsOptions = CreateHttpApiEventOptions & {
    claims: TestJwtClaims;
};

const toJwtClaims = (claims: TestJwtClaims): APIGatewayEventRequestContextJWTAuthorizer['jwt']['claims'] => ({
    sub: claims.sub,
    app_role: claims.app_role,
    ...(claims.merchant_id !== undefined ? { merchant_id: claims.merchant_id } : {}),
    ...(claims.partner_id !== undefined ? { partner_id: claims.partner_id } : {}),
    ...(claims.email !== undefined ? { email: claims.email } : {}),
});

const buildJwtAuthorizer = (claims: TestJwtClaims): APIGatewayEventRequestContextJWTAuthorizer => ({
    principalId: claims.sub,
    integrationLatency: 0,
    jwt: {
        claims: toJwtClaims(claims),
        scopes: [],
    },
});

const buildRequestContext = (requestId: string): APIGatewayEventRequestContextV2 => ({
    accountId: '123456789012',
    apiId: 'api-id',
    domainName: 'example.execute-api.eu-central-1.amazonaws.com',
    domainPrefix: 'example',
    http: {
        method: 'GET',
        path: '/',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
    },
    requestId,
    routeKey: '$default',
    stage: '$default',
    time: '01/Jan/2026:00:00:00 +0000',
    timeEpoch: 0,
});

const buildEventShell = ({
    token,
    body = null,
    headers,
    pathParameters = null,
    queryStringParameters = null,
}: CreateHttpApiEventOptions) => {
    const resolvedToken = token ?? undefined;

    return {
        version: '2.0',
        routeKey: '$default',
        rawPath: '/',
        rawQueryString: '',
        headers: {
            ...(resolvedToken ? { authorization: `Bearer ${resolvedToken}` } : {}),
            ...(headers ?? {}),
        },
        isBase64Encoded: false,
        body: body ?? undefined,
        pathParameters: pathParameters ?? undefined,
        queryStringParameters: queryStringParameters ?? undefined,
        stageVariables: undefined,
        cookies: [] as string[],
    };
};

export function createHttpApiEvent(options: CreateHttpApiEventWithClaimsOptions): TestHttpApiEvent;
export function createHttpApiEvent(options?: CreateHttpApiEventOptions): APIGatewayProxyEventV2;
export function createHttpApiEvent(
    options: CreateHttpApiEventOptions | CreateHttpApiEventWithClaimsOptions = {},
): TestHttpApiEvent | APIGatewayProxyEventV2 {
    const requestId = options.requestId ?? 'req_123';

    if ('claims' in options && options.claims) {
        const { claims, ...rest } = options;

        return {
            ...buildEventShell({
                ...rest,
                token: rest.token ?? createUnsignedJwt(claims),
            }),
            requestContext: {
                ...buildRequestContext(requestId),
                authorizer: buildJwtAuthorizer(claims),
            },
        } satisfies TestHttpApiEvent;
    }

    return {
        ...buildEventShell(options),
        requestContext: buildRequestContext(requestId),
    } satisfies APIGatewayProxyEventV2;
}

/**
 * JWT-protected HTTP API handlers are typed with authorizer context. Use this only in tests
 * that deliberately invoke a handler without API Gateway JWT claims (401 paths).
 */
export const asJwtHandlerEvent = (event: APIGatewayProxyEventV2): TestHttpApiEvent => event as TestHttpApiEvent;

/** Shape accepted by requireAuthContext — unauthenticated fixtures need an explicit bridge. */
export type AuthContextInputEvent = {
    requestContext?: { authorizer?: { jwt?: { claims?: Record<string, unknown> } } };
    headers?: Record<string, string | undefined>;
};

export const asAuthContextEvent = (event: APIGatewayProxyEventV2): AuthContextInputEvent =>
    event as AuthContextInputEvent;
