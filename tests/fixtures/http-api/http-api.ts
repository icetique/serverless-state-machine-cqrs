// Minimal HTTP API v2 + JWT authorizer shapes for shared test fixtures (no aws-lambda dependency).

export interface TestJwtAuthorizerContext {
    principalId: string;
    integrationLatency: number;
    jwt: {
        claims: Record<string, string | number | boolean | string[]>;
        scopes: string[];
    };
}

export interface TestHttpRequestContextV2 {
    accountId: string;
    apiId: string;
    domainName: string;
    domainPrefix: string;
    http: {
        method: string;
        path: string;
        protocol: string;
        sourceIp: string;
        userAgent: string;
    };
    requestId: string;
    routeKey: string;
    stage: string;
    time: string;
    timeEpoch: number;
    authorizer?: TestJwtAuthorizerContext;
}

export interface TestHttpApiEventBase {
    version: string;
    routeKey: string;
    rawPath: string;
    rawQueryString: string;
    headers: Record<string, string | undefined>;
    isBase64Encoded: boolean;
    body?: string;
    pathParameters?: Record<string, string>;
    queryStringParameters?: Record<string, string>;
    stageVariables?: Record<string, string>;
    cookies: string[];
    requestContext: TestHttpRequestContextV2;
}

export type TestHttpApiEvent = TestHttpApiEventBase & {
    requestContext: TestHttpRequestContextV2 & {
        authorizer: TestJwtAuthorizerContext;
    };
};

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

const toJwtClaims = (claims: TestJwtClaims): Record<string, string | number | boolean | string[]> => ({
    sub: claims.sub,
    app_role: claims.app_role,
    ...(claims.merchant_id !== undefined ? { merchant_id: claims.merchant_id } : {}),
    ...(claims.partner_id !== undefined ? { partner_id: claims.partner_id } : {}),
    ...(claims.email !== undefined ? { email: claims.email } : {}),
});

const buildJwtAuthorizer = (claims: TestJwtClaims): TestJwtAuthorizerContext => ({
    principalId: claims.sub,
    integrationLatency: 0,
    jwt: {
        claims: toJwtClaims(claims),
        scopes: [],
    },
});

const buildRequestContext = (requestId: string): TestHttpRequestContextV2 => ({
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
export function createHttpApiEvent(options?: CreateHttpApiEventOptions): TestHttpApiEventBase;
export function createHttpApiEvent(
    options: CreateHttpApiEventOptions | CreateHttpApiEventWithClaimsOptions = {},
): TestHttpApiEvent | TestHttpApiEventBase {
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
        };
    }

    return {
        ...buildEventShell(options),
        requestContext: buildRequestContext(requestId),
    };
}

/**
 * JWT-protected HTTP API handlers are typed with authorizer context. Use this only in tests
 * that deliberately invoke a handler without API Gateway JWT claims (401 paths).
 */
export const asJwtHandlerEvent = (event: TestHttpApiEventBase): TestHttpApiEvent => event as TestHttpApiEvent;

/** Shape accepted by requireAuthContext — unauthenticated fixtures need an explicit bridge. */
export type AuthContextInputEvent = {
    requestContext?: { authorizer?: { jwt?: { claims?: Record<string, unknown> } } };
    headers?: Record<string, string | undefined>;
};

export const asAuthContextEvent = (event: TestHttpApiEventBase): AuthContextInputEvent =>
    event as AuthContextInputEvent;
