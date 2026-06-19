import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGREEMENT_CREATED_DETAIL_TYPE, AGREEMENT_EVENT_SOURCE, buildAgreementEvent } from '../events/agreement-events';

test('buildAgreementEvent wraps detail with source and detailType', () => {
    const event = buildAgreementEvent(AGREEMENT_CREATED_DETAIL_TYPE, {
        agreementId: 'agr_123',
        merchantId: 'merchant_1',
        partnerId: 'partner_2',
        amount: 1000,
        previousStatus: null,
        newStatus: 'CREATED',
    });

    assert.deepEqual(event, {
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
