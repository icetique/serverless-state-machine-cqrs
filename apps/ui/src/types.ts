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

export type AgreementStatus = 'CREATED' | 'APPROVED' | 'FUNDED' | 'SETTLED';

export type AgreementSummary = {
    agreementId: string;
    status: AgreementStatus;
    merchantId: string;
    partnerId: string;
    amount: number;
    createdAt: string;
};

export type EventRecord = {
    id: number;
    agreementId: string;
    eventType: string;
    previousStatus: string | null;
    newStatus: string;
    requestId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    createdAt: string;
};

export type LedgerEntry = {
    transactionId: string;
    agreementId: string;
    amount: number;
    entryType: string;
    createdAt: string;
};

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

export type TransitionAction = 'approve' | 'fund' | 'settle';
