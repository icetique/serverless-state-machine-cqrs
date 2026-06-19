import type { AgreementState } from './agreement-state';
import type { AgreementEventDetail, AgreementEventType, AgreementStatus } from '../events/agreement-events';
import { InvalidTransitionError, validateTransition } from '../state-machine';

export interface StreamEventRecord {
    streamVersion: number;
    eventType: AgreementEventType;
    payload: AgreementEventDetail & { transactionId?: string };
}

export interface AgreementAggregate {
    state: AgreementState | null;
    version: number;
}

export const emptyAggregate = (): AgreementAggregate => ({
    state: null,
    version: 0,
});

const applyEvent = (state: AgreementState | null, event: StreamEventRecord): AgreementState => {
    const { eventType, payload } = event;

    if (eventType === 'AgreementCreated') {
        return {
            agreementId: payload.agreementId,
            status: 'CREATED',
            merchantId: payload.merchantId,
            partnerId: payload.partnerId,
            amount: payload.amount,
        };
    }

    if (!state) {
        throw new Error(`Cannot apply ${eventType} to an empty stream`);
    }

    return {
        ...state,
        status: payload.newStatus,
    };
};

export const fromEvents = (events: StreamEventRecord[]): AgreementAggregate => {
    const ordered = [...events].sort((a, b) => a.streamVersion - b.streamVersion);
    let state: AgreementState | null = null;

    for (const event of ordered) {
        state = applyEvent(state, event);
    }

    return {
        state,
        version: ordered.length,
    };
};

export const buildCreatedEventDetail = (input: {
    agreementId: string;
    merchantId: string;
    partnerId: string;
    amount: number;
}): AgreementEventDetail => ({
    agreementId: input.agreementId,
    merchantId: input.merchantId,
    partnerId: input.partnerId,
    amount: input.amount,
    previousStatus: null,
    newStatus: 'CREATED',
});

export const buildTransitionEventDetail = (
    state: AgreementState,
    from: AgreementStatus,
    to: AgreementStatus,
): AgreementEventDetail => ({
    agreementId: state.agreementId,
    merchantId: state.merchantId,
    partnerId: state.partnerId,
    amount: state.amount ?? 0,
    previousStatus: from,
    newStatus: to,
});

export type DecideCreateResult = { kind: 'ok'; event: StreamEventRecord } | { kind: 'stream_exists' };

export const decideCreate = (
    aggregate: AgreementAggregate,
    input: {
        agreementId: string;
        merchantId: string;
        partnerId: string;
        amount: number;
    },
): DecideCreateResult => {
    if (aggregate.version > 0) {
        return { kind: 'stream_exists' };
    }

    const detail = buildCreatedEventDetail(input);

    return {
        kind: 'ok',
        event: {
            streamVersion: 1,
            eventType: 'AgreementCreated',
            payload: detail,
        },
    };
};

export type DecideTransitionResult =
    | { kind: 'ok'; event: StreamEventRecord }
    | { kind: 'not_found' }
    | { kind: 'invalid_transition'; currentStatus: AgreementStatus };

export const decideTransition = (
    aggregate: AgreementAggregate,
    eventType: Exclude<AgreementEventType, 'AgreementCreated'>,
): DecideTransitionResult => {
    if (!aggregate.state) {
        return { kind: 'not_found' };
    }

    const transition = validateTransition(eventType, aggregate.state.status);
    if (transition instanceof InvalidTransitionError) {
        return {
            kind: 'invalid_transition',
            currentStatus: aggregate.state.status,
        };
    }

    const detail = buildTransitionEventDetail(aggregate.state, transition.from, transition.to);

    return {
        kind: 'ok',
        event: {
            streamVersion: aggregate.version + 1,
            eventType,
            payload: detail,
        },
    };
};

export const decideSettlement = (aggregate: AgreementAggregate, transactionId: string): DecideTransitionResult => {
    const base = decideTransition(aggregate, 'AgreementSettled');

    if (base.kind !== 'ok') {
        return base;
    }

    return {
        kind: 'ok',
        event: {
            ...base.event,
            payload: {
                ...base.event.payload,
                transactionId,
            },
        },
    };
};
