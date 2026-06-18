import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    adminIdentity,
    fundedAgreement,
    makeMockWorkflowApi,
    merchantIdentity,
    settledAgreement,
} from '../test-support/fixtures';
import { useWorkflowData } from './useWorkflowData';

describe('useWorkflowData', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads agreements for merchant on identity change', async () => {
        const listAgreements = vi.fn(async () => [fundedAgreement]);
        const listEvents = vi.fn(async () => []);
        const listLedger = vi.fn(async () => []);
        const api = makeMockWorkflowApi({ listAgreements, listEvents, listLedger });

        const { result } = renderHook(() =>
            useWorkflowData({
                api,
                identity: merchantIdentity,
                sessionAccessToken: 'token',
            }),
        );

        await waitFor(() => {
            expect(result.current.agreements).toEqual([fundedAgreement]);
        });

        expect(listAgreements).toHaveBeenCalled();
        expect(listEvents).not.toHaveBeenCalled();
        expect(listLedger).not.toHaveBeenCalled();
    });

    it('loads agreements, events, and ledger for admin', async () => {
        const listAgreements = vi.fn(async () => [fundedAgreement]);
        const listEvents = vi.fn(async () => []);
        const listLedger = vi.fn(async () => []);
        const api = makeMockWorkflowApi({ listAgreements, listEvents, listLedger });

        renderHook(() =>
            useWorkflowData({
                api,
                identity: adminIdentity,
                sessionAccessToken: 'token',
            }),
        );

        await waitFor(() => {
            expect(listAgreements).toHaveBeenCalled();
            expect(listEvents).toHaveBeenCalled();
            expect(listLedger).toHaveBeenCalled();
        });
    });

    it('clears data when session token is removed', async () => {
        const listAgreements = vi.fn(async () => [fundedAgreement]);
        const api = makeMockWorkflowApi({ listAgreements });

        const { result, rerender } = renderHook(
            ({ token }: { token: string | null }) =>
                useWorkflowData({
                    api,
                    identity: merchantIdentity,
                    sessionAccessToken: token,
                }),
            { initialProps: { token: 'token' as string | null } },
        );

        await waitFor(() => {
            expect(result.current.agreements).toEqual([fundedAgreement]);
        });

        rerender({ token: null });

        await waitFor(() => {
            expect(result.current.agreements).toEqual([]);
            expect(result.current.isLoadingAgreements).toBe(false);
        });
    });

    it('starts polling interval while session token is present', async () => {
        const setIntervalSpy = vi.spyOn(window, 'setInterval');
        const listAgreements = vi.fn(async () => [fundedAgreement]);
        const api = makeMockWorkflowApi({ listAgreements });

        renderHook(() =>
            useWorkflowData({
                api,
                identity: merchantIdentity,
                sessionAccessToken: 'token',
            }),
        );

        await waitFor(() => {
            expect(setIntervalSpy).toHaveBeenCalled();
        });
    });

    it('refresh reloads agreements', async () => {
        const listAgreements = vi.fn(async () => [fundedAgreement]);
        const api = makeMockWorkflowApi({ listAgreements });

        const { result } = renderHook(() =>
            useWorkflowData({
                api,
                identity: merchantIdentity,
                sessionAccessToken: 'token',
            }),
        );

        await waitFor(() => {
            expect(listAgreements).toHaveBeenCalledTimes(1);
        });

        act(() => {
            result.current.refresh();
        });

        await waitFor(() => {
            expect(listAgreements).toHaveBeenCalledTimes(2);
        });
    });

    it('updateAgreementStatus optimistically updates local state', async () => {
        const listAgreements = vi.fn(async () => [fundedAgreement]);
        const api = makeMockWorkflowApi({ listAgreements });

        const { result } = renderHook(() =>
            useWorkflowData({
                api,
                identity: merchantIdentity,
                sessionAccessToken: 'token',
            }),
        );

        await waitFor(() => {
            expect(result.current.agreements[0]?.status).toBe('FUNDED');
        });

        act(() => {
            result.current.updateAgreementStatus('agr_1', 'SETTLED');
        });

        expect(result.current.agreements[0]?.status).toBe('SETTLED');
    });

    it('surfaces poll errors instead of swallowing them', async () => {
        let pollCallback: (() => void) | null = null;
        let failNextPoll = false;

        vi.spyOn(window, 'setInterval').mockImplementation((callback) => {
            pollCallback = callback as () => void;
            return 1;
        });
        vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

        const listAgreements = vi.fn(async () => {
            if (failNextPoll) {
                throw new Error('poll failed');
            }

            return [fundedAgreement];
        });
        const api = makeMockWorkflowApi({ listAgreements });

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

        failNextPoll = true;

        await act(async () => {
            pollCallback?.();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.agreementsError).toBe('poll failed');
    });

    it('does not poll errors when all agreements are settled', async () => {
        let pollCallback: (() => void) | null = null;

        vi.spyOn(window, 'setInterval').mockImplementation((callback) => {
            pollCallback = callback as () => void;
            return 1;
        });

        const listAgreements = vi.fn(async () => [settledAgreement]);
        const api = makeMockWorkflowApi({ listAgreements });

        renderHook(() =>
            useWorkflowData({
                api,
                identity: merchantIdentity,
                sessionAccessToken: 'token',
            }),
        );

        await waitFor(() => {
            expect(listAgreements).toHaveBeenCalled();
        });

        const callsBeforePoll = listAgreements.mock.calls.length;

        await act(async () => {
            pollCallback?.();
            await Promise.resolve();
        });

        expect(listAgreements.mock.calls.length).toBe(callsBeforePoll);
    });
});
