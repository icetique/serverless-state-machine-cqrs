import type { SessionIdentity } from '../../../../shared/auth-contract';
import {
    canRunAction,
    canViewAgreementAction as domainCanViewAgreementAction,
    getActionTargetStatus,
    type TransitionAction,
} from '@cqrs/domain';
import type { AgreementStatus, AgreementSummary } from '../types';

export { canRunAction };

export const getStatusTone = (status: AgreementStatus): string => status.toLowerCase();

export const getActionTone = (action: TransitionAction): AgreementStatus => getActionTargetStatus(action);

export const canViewAgreementAction = (
    identity: SessionIdentity,
    agreement: AgreementSummary,
    action: TransitionAction,
    isManualSettlementTriggerEnabled: boolean,
): boolean => domainCanViewAgreementAction(identity, agreement, action, isManualSettlementTriggerEnabled);
