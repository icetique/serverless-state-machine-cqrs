import type { FormEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    approvedAgreement,
    fundedAgreement,
    makeAgreementResult,
    makeMockWorkflowApi,
    merchantIdentity,
    partnerIdentity,
} from '../test-support/fixtures';
import { useAgreementCommands } from './useAgreementCommands';

const loadEvents = vi.fn(async () => []);
const loadLedger = vi.fn(async () => []);

describe('useAgreementCommands', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('creates agreement with idempotency key and rotates key on success', async () => {
        const createResult = makeAgreementResult();
        const createAgreement = vi.fn(async () => createResult);
        const loadAgreements = vi.fn(async () => []);
        const api = makeMockWorkflowApi({ createAgreement });

        const { result } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: merchantIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements,
                loadEvents,
                loadLedger,
                updateAgreementStatus: vi.fn(),
            }),
        );

        const initialKey = result.current.idempotencyKey;

        await act(async () => {
            await result.current.runCreateAgreement({
                preventDefault: vi.fn(),
            } as unknown as FormEvent<HTMLFormElement>);
        });

        expect(createAgreement).toHaveBeenCalledWith(
            expect.objectContaining({
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
            }),
            initialKey,
        );
        expect(result.current.idempotencyKey).not.toBe(initialKey);
        expect(result.current.result).toEqual(createResult);
    });

    it('blocks create for non-merchant roles', async () => {
        const createAgreement = vi.fn(async () => makeAgreementResult());
        const api = makeMockWorkflowApi({ createAgreement });

        const { result } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: partnerIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements: vi.fn(async () => []),
                loadEvents,
                loadLedger,
                updateAgreementStatus: vi.fn(),
            }),
        );

        await act(async () => {
            await result.current.runCreateAgreement({
                preventDefault: vi.fn(),
            } as unknown as FormEvent<HTMLFormElement>);
        });

        expect(createAgreement).not.toHaveBeenCalled();
        expect(result.current.error).toBeTruthy();
    });

    it('blocks fund transition for partner', async () => {
        const transitionAgreement = vi.fn();
        const api = makeMockWorkflowApi({ transitionAgreement });

        const { result } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: partnerIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements: vi.fn(async () => [approvedAgreement]),
                loadEvents,
                loadLedger,
                updateAgreementStatus: vi.fn(),
            }),
        );

        await act(async () => {
            await result.current.runTransition(approvedAgreement, 'fund');
        });

        expect(transitionAgreement).not.toHaveBeenCalled();
        expect(result.current.actionError).toBeTruthy();
    });

    it('does not invoke transition when manual settle is disabled', async () => {
        const transitionAgreement = vi.fn();
        const api = makeMockWorkflowApi({ transitionAgreement });

        const { result } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: merchantIdentity,
                isManualSettlementTriggerEnabled: false,
                loadAgreements: vi.fn(async () => [fundedAgreement]),
                loadEvents,
                loadLedger,
                updateAgreementStatus: vi.fn(),
            }),
        );

        await act(async () => {
            await result.current.runTransition(fundedAgreement, 'settle');
        });

        expect(transitionAgreement).not.toHaveBeenCalled();
        expect(result.current.actionError).toBeTruthy();
    });

    it('surfaces API failures on transition', async () => {
        const transitionAgreement = vi.fn().mockRejectedValue(new Error('transition failed'));
        const api = makeMockWorkflowApi({ transitionAgreement });

        const { result } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: merchantIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements: vi.fn(async () => [fundedAgreement]),
                loadEvents,
                loadLedger,
                updateAgreementStatus: vi.fn(),
            }),
        );

        await act(async () => {
            await result.current.runTransition(fundedAgreement, 'settle');
        });

        expect(result.current.actionError).toBe('transition failed');
        expect(result.current.activeAction).toBeNull();
    });

    it('clears activeAction immediately when status changes', async () => {
        const settled = { ...fundedAgreement, status: 'SETTLED' as const };
        const transitionAgreement = vi.fn(async () => ({
            agreementId: fundedAgreement.agreementId,
            merchantId: fundedAgreement.merchantId,
            partnerId: fundedAgreement.partnerId,
            amount: fundedAgreement.amount,
            newStatus: 'SETTLED',
        }));
        const loadAgreements = vi.fn(async () => [settled]);
        const api = makeMockWorkflowApi({ transitionAgreement });

        const { result } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: merchantIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements,
                loadEvents,
                loadLedger,
                updateAgreementStatus: vi.fn(),
            }),
        );

        await act(async () => {
            await result.current.runTransition(fundedAgreement, 'settle');
        });

        expect(result.current.activeAction).toBeNull();
    });

    it('clears the reset timer on unmount before it fires', async () => {
        const transitionAgreement = vi.fn(async () => ({
            agreementId: fundedAgreement.agreementId,
            merchantId: fundedAgreement.merchantId,
            partnerId: fundedAgreement.partnerId,
            amount: fundedAgreement.amount,
            newStatus: 'FUNDED',
        }));
        const loadAgreements = vi.fn(async () => [fundedAgreement]);
        const api = makeMockWorkflowApi({ transitionAgreement });

        const { result, unmount } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: merchantIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements,
                loadEvents,
                loadLedger,
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
        const transitionAgreement = vi.fn(async () => ({
            agreementId: fundedAgreement.agreementId,
            merchantId: fundedAgreement.merchantId,
            partnerId: fundedAgreement.partnerId,
            amount: fundedAgreement.amount,
            newStatus: 'FUNDED',
        }));
        const loadAgreements = vi.fn(async () => [fundedAgreement]);
        const api = makeMockWorkflowApi({ transitionAgreement });

        const { result } = renderHook(() =>
            useAgreementCommands({
                api,
                identity: merchantIdentity,
                isManualSettlementTriggerEnabled: true,
                loadAgreements,
                loadEvents,
                loadLedger,
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
