import type { AgreementStatus } from '../events/agreement-events';
export interface AgreementState {
    agreementId: string;
    status: AgreementStatus;
    merchantId: string;
    partnerId: string;
    amount?: number;
}
