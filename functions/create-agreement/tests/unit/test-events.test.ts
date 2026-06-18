import { describe, expect, it } from '@jest/globals';
import {
    AGREEMENT_CREATED_DETAIL_TYPE,
    AGREEMENT_EVENT_SOURCE,
    buildAgreementEvent,
} from '@payments-example/lambda-utils';

describe('buildAgreementEvent', () => {
    it('builds an AgreementDomainEvent with the correct shape', () => {
        const event = buildAgreementEvent(AGREEMENT_CREATED_DETAIL_TYPE, {
            agreementId: 'agr_123',
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
            previousStatus: null,
            newStatus: 'CREATED',
        });

        expect(event).toEqual({
            source: AGREEMENT_EVENT_SOURCE,
            detailType: 'AgreementCreated',
            detail: {
                agreementId: 'agr_123',
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
                amount: 1000,
                previousStatus: null,
                newStatus: 'CREATED',
            },
        });
    });
});
