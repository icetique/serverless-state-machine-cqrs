import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { parseMoneyMinorUnits } from '@cqrs/domain';
import type { SessionIdentity } from '../../../../shared/auth-contract';
import { canViewAgreementAction } from './permissions';
import type { AgreementResult, AgreementSummary, FormState, TransitionAction } from '../types';
import type { WorkflowApi } from './workflowApi';

const initialForm: FormState = {
    merchantId: '',
    partnerId: 'partner_2',
    amount: '1000',
};

type UseAgreementCommandsArgs = {
    api: WorkflowApi;
    identity: SessionIdentity | null;
    isManualSettlementTriggerEnabled: boolean;
    loadAgreements: () => Promise<AgreementSummary[]>;
    loadEvents: () => Promise<unknown[]>;
    loadLedger: () => Promise<unknown[]>;
    updateAgreementStatus: (agreementId: string, status: AgreementSummary['status']) => void;
};

type UseAgreementCommandsResult = {
    actionError: string | null;
    activeAction: string | null;
    error: string | null;
    form: FormState;
    idempotencyKey: string;
    isSubmitting: boolean;
    onAmountChange: (value: string) => void;
    onPartnerIdChange: (value: string) => void;
    resetForSignOut: () => void;
    result: AgreementResult | null;
    runCreateAgreement: (event: FormEvent<HTMLFormElement>) => Promise<void>;
    runTransition: (agreement: AgreementSummary, action: TransitionAction) => Promise<void>;
};

export const useAgreementCommands = ({
    api,
    identity,
    isManualSettlementTriggerEnabled,
    loadAgreements,
    loadEvents,
    loadLedger,
    updateAgreementStatus,
}: UseAgreementCommandsArgs): UseAgreementCommandsResult => {
    const [form, setForm] = useState<FormState>(initialForm);
    const [result, setResult] = useState<AgreementResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
    const [actionKeys, setActionKeys] = useState<Record<string, string>>({});
    const [actionError, setActionError] = useState<string | null>(null);
    const [activeAction, setActiveAction] = useState<string | null>(null);
    const activeActionResetTimerRef = useRef<number | null>(null);

    const clearActiveActionResetTimer = useCallback(() => {
        if (activeActionResetTimerRef.current !== null) {
            window.clearTimeout(activeActionResetTimerRef.current);
            activeActionResetTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            clearActiveActionResetTimer();
        };
    }, [clearActiveActionResetTimer]);

    const isMerchant = identity?.role === 'merchant';

    useEffect(() => {
        if (!isMerchant) {
            return;
        }

        setForm((current) => ({
            ...current,
            merchantId: identity?.merchantId ?? '',
        }));
    }, [identity?.merchantId, isMerchant]);

    const resetForSignOut = () => {
        clearActiveActionResetTimer();
        setActiveAction(null);
        setResult(null);
        setError(null);
        setActionError(null);
        setActionKeys({});
        setIdempotencyKey(crypto.randomUUID());
        setForm((current) => ({
            ...initialForm,
            merchantId: current.merchantId,
        }));
    };

    const runCreateAgreement = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();

        if (!identity || identity.role !== 'merchant') {
            setError('Only merchants may create agreements');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const amount = parseMoneyMinorUnits(Number(form.amount));
            const createResult = await api.createAgreement(
                {
                    merchantId: identity.merchantId ?? '',
                    partnerId: form.partnerId,
                    amount,
                },
                idempotencyKey,
            );

            setResult(createResult);
            setIdempotencyKey(crypto.randomUUID());
            setIsSubmitting(false);
            void loadAgreements();
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : 'amount must be a positive integer in minor currency units (e.g. cents)',
            );
            setIsSubmitting(false);
        }
    };

    const runTransition = async (agreement: AgreementSummary, action: TransitionAction): Promise<void> => {
        if (!identity) {
            setActionError('Authentication is required');
            return;
        }

        if (action === 'settle' && !isManualSettlementTriggerEnabled) {
            setActionError('Manual settlement trigger is disabled');
            return;
        }

        if (!canViewAgreementAction(identity, agreement, action, isManualSettlementTriggerEnabled)) {
            setActionError(`You may not ${action} this agreement`);
            return;
        }

        const mapKey = `${agreement.agreementId}:${action}`;
        const key = actionKeys[mapKey] ?? crypto.randomUUID();
        setActionError(null);
        setActiveAction(mapKey);

        try {
            const resultBody = await api.transitionAgreement(agreement.agreementId, action, key);

            setActionKeys((current) => ({ ...current, [mapKey]: key }));
            setResult(resultBody);
            if (resultBody.agreementId && resultBody.newStatus) {
                updateAgreementStatus(resultBody.agreementId, resultBody.newStatus as AgreementSummary['status']);
            }
            const updatedAgreements = await loadAgreements();
            const updated = updatedAgreements.find((a) => a.agreementId === agreement.agreementId);

            if (updated && updated.status === agreement.status) {
                // Status hasn't changed yet (e.g. async settlement) —
                // unblock the button after 15s; the auto-poll in
                // useWorkflowData will refresh the list when it flips
                clearActiveActionResetTimer();
                activeActionResetTimerRef.current = window.setTimeout(() => {
                    activeActionResetTimerRef.current = null;
                    setActiveAction(null);
                }, 15_000);
            } else {
                clearActiveActionResetTimer();
                setActiveAction(null);
            }

            if (identity.role === 'admin') {
                await Promise.all([loadEvents(), loadLedger()]);
            }
        } catch (caughtError) {
            clearActiveActionResetTimer();
            setActionError(caughtError instanceof Error ? caughtError.message : 'Unknown transition failure');
            setActiveAction(null);
        }
    };

    const onAmountChange = (value: string) => {
        setForm((current) => ({ ...current, amount: value }));
    };

    const onPartnerIdChange = (value: string) => {
        setForm((current) => ({ ...current, partnerId: value }));
    };

    return {
        actionError,
        activeAction,
        error,
        form,
        idempotencyKey,
        isSubmitting,
        onAmountChange,
        onPartnerIdChange,
        resetForSignOut,
        result,
        runCreateAgreement,
        runTransition,
    };
};
