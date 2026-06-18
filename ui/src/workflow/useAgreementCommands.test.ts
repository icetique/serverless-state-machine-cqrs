import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionIdentity } from '../../../shared/auth-contract';
import type { AgreementSummary } from '../types';
import { useAgreementCommands } from './useAgreementCommands';
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

describe('useAgreementCommands active-action timer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('clears the reset timer on unmount before it fires', async () => {
        const loadAgreements = vi.fn(async () => [fundedAgreement]);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                agreementId: fundedAgreement.agreementId,
                newStatus: 'FUNDED',
            }),
        });

        vi.stubGlobal('fetch', fetchMock);

        const { result, unmount } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: merchantIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements,
                loadEvents: vi.fn(async () => []),
                loadLedger: vi.fn(async () => []),
                updateAgreementStatus: vi.fn(),
            }),
        );

        await act(async () => {
            await result.current.runTransition(fundedAgreement, 'settle');
        });

        expect(result.current.activeAction).toBe('agr_1:settle');

        unmount();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(15_000);
        });
    });

    it('clears activeAction when resetForSignOut is called during the wait', async () => {
        const loadAgreements = vi.fn(async () => [fundedAgreement]);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                agreementId: fundedAgreement.agreementId,
                newStatus: 'FUNDED',
            }),
        });

        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: merchantIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements,
                loadEvents: vi.fn(async () => []),
                loadLedger: vi.fn(async () => []),
                updateAgreementStatus: vi.fn(),
            }),
        );

        await act(async () => {
            await result.current.runTransition(fundedAgreement, 'settle');
        });

        expect(result.current.activeAction).toBe('agr_1:settle');

        act(() => {
            result.current.resetForSignOut();
        });

        expect(result.current.activeAction).toBeNull();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(15_000);
        });

        expect(result.current.activeAction).toBeNull();
    });
});
