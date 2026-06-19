export declare const AGREEMENT_CREATED_DETAIL_TYPE = "AgreementCreated";
export declare const AGREEMENT_APPROVED_DETAIL_TYPE = "AgreementApproved";
export declare const AGREEMENT_FUNDED_DETAIL_TYPE = "AgreementFunded";
export declare const AGREEMENT_SETTLED_DETAIL_TYPE = "AgreementSettled";
export declare const AGREEMENT_EVENT_SOURCE = "serverless-state-machine-cqrs.agreements";
export type AgreementEventType = typeof AGREEMENT_CREATED_DETAIL_TYPE | typeof AGREEMENT_APPROVED_DETAIL_TYPE | typeof AGREEMENT_FUNDED_DETAIL_TYPE | typeof AGREEMENT_SETTLED_DETAIL_TYPE;
export type AgreementStatus = 'CREATED' | 'APPROVED' | 'FUNDED' | 'SETTLED';
export interface AgreementEventDetail {
    agreementId: string;
    merchantId: string;
    partnerId: string;
    amount: number;
    previousStatus: AgreementStatus | null;
    newStatus: AgreementStatus;
}
