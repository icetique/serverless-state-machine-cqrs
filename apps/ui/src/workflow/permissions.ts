import type { SessionIdentity } from '../../../../shared/auth-contract';
import type { AgreementStatus, AgreementSummary, TransitionAction } from '../types';

const canRunAction = (status: AgreementStatus, action: TransitionAction): boolean => {
    if (action === 'approve') {
        return status === 'CREATED';
    }

    if (action === 'fund') {
        return status === 'APPROVED';
    }

    return status === 'FUNDED';
};

export const getStatusTone = (status: AgreementStatus): string => status.toLowerCase();

export const getActionTone = (action: TransitionAction): AgreementStatus => {
    if (action === 'approve') {
        return 'APPROVED';
    }

    if (action === 'fund') {
        return 'FUNDED';
    }

    return 'SETTLED';
};

export const canViewAgreementAction = (
    identity: SessionIdentity,
    agreement: AgreementSummary,
    action: TransitionAction,
    isManualSettlementTriggerEnabled: boolean,
): boolean => {
    if (!canRunAction(agreement.status, action)) {
        return false;
    }

    if (action === 'settle' && !isManualSettlementTriggerEnabled) {
        return false;
    }

    if (action === 'approve') {
        return identity.role === 'partner' && identity.partnerId === agreement.partnerId;
    }

    return identity.role === 'merchant' && identity.merchantId === agreement.merchantId;
};
