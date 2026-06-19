import type {
    AgreementListItem,
    AgreementStatus,
    EventStreamItem,
    LedgerEntryView,
    TransitionAction,
} from '@cqrs/domain';

export type { AgreementStatus, TransitionAction };

export type AgreementResult = {
    agreementId: string;
    merchantId: string;
    partnerId: string;
    amount: number;
    status?: string;
    previousStatus?: string | null;
    newStatus?: string;
    transactionId?: string;
};

export type AgreementSummary = AgreementListItem;

export type EventRecord = EventStreamItem & {
    id: number;
    requestId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
};

export type LedgerEntry = LedgerEntryView;

export type FormState = {
    merchantId: string;
    partnerId: string;
    amount: string;
};

export type DemoAccount = {
    label: string;
    email: string;
    password: string;
};
