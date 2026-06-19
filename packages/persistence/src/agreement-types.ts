import type { AgreementEventDetail, AgreementStatus } from '@serverless-state-machine-cqrs/domain';

export interface AgreementRecord {
    agreementId: string;
    status: AgreementStatus;
    merchantId: string;
    partnerId: string;
    amount: number;
}

export interface AgreementLookup {
    agreementId: string;
    status: AgreementStatus;
    merchantId: string;
    partnerId: string;
}

export type TransitionPayload = AgreementEventDetail & { transactionId?: string };

export type CreateAgreementResult =
    | {
          kind: 'created';
          agreement: AgreementRecord;
          eventPayload: AgreementRecord;
      }
    | {
          kind: 'replayed';
          agreement: AgreementRecord;
      }
    | {
          kind: 'conflict';
      };

export type TransitionAgreementResult =
    | {
          kind: 'transitioned';
          payload: TransitionPayload;
      }
    | {
          kind: 'replayed';
          payload: TransitionPayload;
      }
    | {
          kind: 'conflict';
      }
    | {
          kind: 'not_found';
      }
    | {
          kind: 'invalid_transition';
          currentStatus: AgreementStatus;
      };
