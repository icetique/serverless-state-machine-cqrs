import type { AgreementEventType, AgreementStatus } from './events/agreement-events';
import type { AuthRole } from './auth/command-auth';
import type { AgreementState } from './aggregate/agreement-state';

export type TransitionAction = 'approve' | 'fund' | 'settle';

export interface TransitionSpec {
    eventType: AgreementEventType;
    from: AgreementStatus;
    to: AgreementStatus;
    role: AuthRole;
}

export const AGREEMENT_TRANSITIONS: Record<Exclude<AgreementEventType, 'AgreementCreated'>, TransitionSpec> = {
    AgreementApproved: { eventType: 'AgreementApproved', from: 'CREATED', to: 'APPROVED', role: 'partner' },
    AgreementFunded: { eventType: 'AgreementFunded', from: 'APPROVED', to: 'FUNDED', role: 'merchant' },
    AgreementSettled: { eventType: 'AgreementSettled', from: 'FUNDED', to: 'SETTLED', role: 'merchant' },
};

export const TRANSITION_ACTION_EVENT_TYPES: Record<
    TransitionAction,
    Exclude<AgreementEventType, 'AgreementCreated'>
> = {
    approve: 'AgreementApproved',
    fund: 'AgreementFunded',
    settle: 'AgreementSettled',
};

export const getSpecForAction = (action: TransitionAction): TransitionSpec =>
    AGREEMENT_TRANSITIONS[TRANSITION_ACTION_EVENT_TYPES[action]];

export class DomainAuthorizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DomainAuthorizationError';
    }
}

export class InvalidTransitionError extends Error {
    constructor(
        message: string,
        readonly currentStatus?: AgreementStatus,
    ) {
        super(message);
        this.name = 'InvalidTransitionError';
    }
}

export const getTransitionSpec = (eventType: AgreementEventType): TransitionSpec | null => {
    if (eventType === 'AgreementCreated') {
        return null;
    }

    return AGREEMENT_TRANSITIONS[eventType];
};

export const assertTransitionConfig = (
    eventType: AgreementEventType,
    expectedCurrentStatus: AgreementStatus,
    nextStatus: AgreementStatus,
): TransitionSpec => {
    const spec = getTransitionSpec(eventType);

    if (!spec) {
        throw new InvalidTransitionError(`Event type ${eventType} is not a transition`);
    }

    if (spec.from !== expectedCurrentStatus || spec.to !== nextStatus) {
        throw new InvalidTransitionError(
            `Transition config mismatch for ${eventType}: expected ${spec.from}->${spec.to}, got ${expectedCurrentStatus}->${nextStatus}`,
        );
    }

    return spec;
};

export const validateTransition = (
    eventType: AgreementEventType,
    currentStatus: AgreementStatus,
): TransitionSpec | InvalidTransitionError => {
    const spec = getTransitionSpec(eventType);

    if (!spec) {
        return new InvalidTransitionError(`Event type ${eventType} is not a transition`);
    }

    if (spec.from !== currentStatus) {
        return new InvalidTransitionError(`Invalid transition from ${currentStatus} via ${eventType}`, currentStatus);
    }

    return spec;
};

export const canRunAction = (status: AgreementStatus, action: TransitionAction): boolean =>
    getSpecForAction(action).from === status;

export const getActionTargetStatus = (action: TransitionAction): AgreementStatus => getSpecForAction(action).to;

export const authorizeTransition = (
    auth: { role: AuthRole; merchantId?: string; partnerId?: string },
    agreement: AgreementState,
    eventType: AgreementEventType,
): void => {
    const spec = getTransitionSpec(eventType);

    if (!spec) {
        throw new InvalidTransitionError(`Event type ${eventType} is not a transition`);
    }

    if (auth.role !== spec.role) {
        throw new DomainAuthorizationError(`Only ${spec.role}s may perform ${eventType}`);
    }

    if (spec.role === 'partner') {
        if (auth.partnerId !== agreement.partnerId) {
            throw new DomainAuthorizationError('Partners may only act on their own agreements');
        }
        return;
    }

    if (auth.merchantId !== agreement.merchantId) {
        throw new DomainAuthorizationError('Merchants may only act on their own agreements');
    }
};

export const canViewAgreementAction = (
    auth: { role: AuthRole; merchantId?: string; partnerId?: string },
    agreement: AgreementState,
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
        return auth.role === 'partner' && auth.partnerId === agreement.partnerId;
    }

    return auth.role === 'merchant' && auth.merchantId === agreement.merchantId;
};
