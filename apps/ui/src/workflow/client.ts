export type ApiConfig = {
    apiBaseUrl: string;
    buildHeaders: (headers?: Record<string, string>) => Record<string, string>;
};

type ErrorBody = {
    message?: string;
};

export class ApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

const getErrorMessage = (body: unknown, fallback: string): string => {
    if (body && typeof body === 'object' && 'message' in body) {
        const message = (body as ErrorBody).message;
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
    }

    return fallback;
};

type RequestJsonOptions = {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
};

export const requestJson = async <T>(config: ApiConfig, options: RequestJsonOptions): Promise<T> => {
    const { apiBaseUrl, buildHeaders } = config;
    const { path, method, headers = {}, body } = options;

    const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: buildHeaders({
            ...headers,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        }),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const responseBody = (await response.json()) as T | ErrorBody;

    if (!response.ok) {
        throw new ApiError(getErrorMessage(responseBody, 'Request failed'), response.status);
    }

    return responseBody as T;
};
