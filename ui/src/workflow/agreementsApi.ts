import type { AgreementResult, AgreementSummary, TransitionAction } from '../types';
import { type ApiConfig, requestJson } from './client';

type ListAgreementsResponse = {
    agreements?: AgreementSummary[];
};

type CreateAgreementPayload = {
    amount: number;
    merchantId: string;
    partnerId: string;
};

export const createAgreementsApi = (config: ApiConfig) => ({
    listAgreements: async (limit = 10): Promise<AgreementSummary[]> => {
        const body = await requestJson<ListAgreementsResponse>(config, {
            path: `/agreements?limit=${limit}`,
        });

        return body.agreements ?? [];
    },

    createAgreement: async (payload: CreateAgreementPayload, idempotencyKey: string): Promise<AgreementResult> =>
        requestJson<AgreementResult>(config, {
            path: '/agreements',
            method: 'POST',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: payload,
        }),

    transitionAgreement: async (
        agreementId: string,
        action: TransitionAction,
        idempotencyKey: string,
    ): Promise<AgreementResult> =>
        requestJson<AgreementResult>(config, {
            path: `/agreements/${agreementId}/${action}`,
            method: 'POST',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
        }),
});

export type AgreementsApi = ReturnType<typeof createAgreementsApi>;
