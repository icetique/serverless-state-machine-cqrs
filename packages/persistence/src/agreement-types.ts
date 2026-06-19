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

export interface AgreementRow {
    id: number;
    public_id: string;
    status: AgreementStatus;
    merchant_id: string;
    partner_id: string;
    amount: string;
}

export const mapAgreementRow = (row: AgreementRow): AgreementRecord => ({
    agreementId: row.public_id,
    status: row.status,
    merchantId: row.merchant_id,
    partnerId: row.partner_id,
    amount: Number(row.amount),
});

export const mapEventDetail = (
    row: AgreementRow,
    previousStatus: AgreementStatus,
    newStatus: AgreementStatus,
): AgreementEventDetail => ({
    agreementId: row.public_id,
    merchantId: row.merchant_id,
    partnerId: row.partner_id,
    amount: Number(row.amount),
    previousStatus,
    newStatus,
});

export interface TransitionPayload extends AgreementEventDetail {
    transactionId?: string;
}

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
