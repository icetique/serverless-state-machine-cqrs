import { describe, expect, it, vi } from 'vitest';
import { ApiError, requestJson } from './client';

const config = {
    apiBaseUrl: '/api',
    buildHeaders: () => ({ Authorization: 'Bearer token' }),
};

describe('requestJson', () => {
    it('returns parsed JSON for successful responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ agreements: [] }),
            }),
        );

        await expect(requestJson<{ agreements: unknown[] }>(config, { path: '/agreements' })).resolves.toEqual({
            agreements: [],
        });
    });

    it('throws ApiError with the server message for failed responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                json: async () => ({ message: 'Forbidden' }),
            }),
        );

        await expect(requestJson(config, { path: '/agreements' })).rejects.toEqual(new ApiError('Forbidden', 403));
    });
});
