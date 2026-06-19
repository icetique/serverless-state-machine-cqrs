import type { AgreementStatus } from '../events/agreement-events';

export interface AgreementListItem {
    agreementId: string;
    status: AgreementStatus;
    merchantId: string;
    partnerId: string;
    amount: number;
    createdAt: string;
}

export interface LedgerEntryView {
    transactionId: string;
    agreementId: string;
    amount: number;
    entryType: string;
    createdAt: string;
}

export interface EventStreamItem {
    agreementId: string;
    eventType: string;
    previousStatus: AgreementStatus | null;
    newStatus: AgreementStatus;
    actorId: string;
    actorType: string;
    createdAt: string;
}

export interface ListAgreementsQuery {
    limit: number;
    role: 'merchant' | 'partner' | 'admin';
    merchantId?: string;
    partnerId?: string;
}

export interface ListEventStreamQuery {
    limit: number;
    agreementId?: string;
}
