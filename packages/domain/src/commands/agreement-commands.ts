import type { AuthRole, CommandAuthContext } from '../auth/command-auth';
import type { MoneyMinor } from '../money';

export type ActorType = AuthRole | 'system';

export interface CreateAgreementCommand {
    publicId: string;
    merchantId: string;
    partnerId: string;
    amount: MoneyMinor;
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
    auth: CommandAuthContext;
}

export interface SettleAgreementCommand {
    agreementId: string;
    transactionId: string;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    actorId: string;
    actorType: ActorType;
    triggerSource: string;
    messageId?: string;
    auth?: CommandAuthContext;
}
