import type { AuthRole } from '../auth/command-auth';

export type ActorType = AuthRole | 'system';

export interface CreateAgreementCommand {
    publicId: string;
    merchantId: string;
    partnerId: string;
    amount: number;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    actorId: string;
    actorType: ActorType;
}

export interface TransitionAgreementCommand {
    agreementId: string;
    eventType: Exclude<
        import('../events/agreement-events').AgreementEventType,
        'AgreementCreated' | 'AgreementSettled'
    >;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    actorId: string;
    actorType: ActorType;
    expectedVersion?: number;
}

export interface SettleAgreementCommand {
    agreementId: string;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    actorId: string;
    actorType: ActorType;
    triggerSource: string;
    messageId?: string;
}
