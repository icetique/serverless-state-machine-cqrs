import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionIdentity } from '../../../shared/auth-contract';
import type { AgreementSummary } from '../types';
import { useWorkflowData } from './useWorkflowData';
import { createWorkflowApi } from './workflowApi';

const merchantIdentity: SessionIdentity = {
    email: 'merchant_1@example.com',
    merchantId: 'merchant_1',
    role: 'merchant',
    subject: 'merchant-sub',
};

const fundedAgreement: AgreementSummary = {
    agreementId: 'agr_1',
    amount: 1000,
    createdAt: '2026-06-06T00:00:00Z',
    merchantId: 'merchant_1',
    partnerId: 'partner_2',
    status: 'FUNDED',
};

const buildHeaders = () => ({});
const api = createWorkflowApi({ apiBaseUrl: '/api', buildHeaders });

describe('useWorkflowData FUNDED poll', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('surfaces poll errors instead of swallowing them', async () => {
        let pollCallback: (() => void) | null = null;

        vi.spyOn(window, 'setInterval').mockImplementation((callback) => {
            pollCallback = callback as () => void;
            return 1;
        });
        vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

        const fetchMock = vi.fn().mockImplementation(async () => ({
            ok: true,
            json: async () => ({ agreements: [fundedAgreement] }),
        }));

        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() =>
            useWorkflowData({
                api,
                identity: merchantIdentity,
                sessionAccessToken: 'token',
            }),
        );

        await act(async () => {
            await result.current.loadAgreements();
        });

        expect(result.current.agreements).toEqual([fundedAgreement]);

        fetchMock.mockRejectedValueOnce(new Error('poll failed'));

        await act(async () => {
            pollCallback?.();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.agreementsError).toBe('poll failed');
    });
});
