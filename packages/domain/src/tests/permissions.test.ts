import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgreementState } from '../aggregate/agreement-state';
import { canViewAgreementAction } from '../state-machine';
import type { TransitionAction } from '../state-machine';

const createdAgreement: AgreementState = {
    agreementId: 'agr_1',
    status: 'CREATED',
    merchantId: 'merchant_1',
    partnerId: 'partner_2',
    amount: 1000,
};

const approvedAgreement: AgreementState = { ...createdAgreement, status: 'APPROVED' };
const fundedAgreement: AgreementState = { ...createdAgreement, status: 'FUNDED' };
const settledAgreement: AgreementState = { ...createdAgreement, status: 'SETTLED' };

const merchantAuth = { role: 'merchant' as const, merchantId: 'merchant_1' };
const partnerAuth = { role: 'partner' as const, partnerId: 'partner_2' };
const adminAuth = { role: 'admin' as const };

const cases: Array<
    [string, TransitionAction, typeof merchantAuth | typeof partnerAuth | typeof adminAuth, AgreementState, boolean]
> = [
    ['CREATED approve partner', 'approve', partnerAuth, createdAgreement, true],
    ['CREATED fund merchant', 'fund', merchantAuth, createdAgreement, false],
    ['APPROVED fund merchant', 'fund', merchantAuth, approvedAgreement, true],
    ['APPROVED approve partner', 'approve', partnerAuth, approvedAgreement, false],
    ['FUNDED settle merchant', 'settle', merchantAuth, fundedAgreement, true],
    ['FUNDED approve partner', 'approve', partnerAuth, fundedAgreement, false],
    ['SETTLED settle merchant', 'settle', merchantAuth, settledAgreement, false],
];

for (const [label, action, auth, agreement, expected] of cases) {
    test(`canViewAgreementAction: ${label}`, () => {
        assert.equal(canViewAgreementAction(auth, agreement, action, true), expected);
    });
}

test('canViewAgreementAction hides settle when manual trigger is disabled', () => {
    assert.equal(canViewAgreementAction(merchantAuth, fundedAgreement, 'settle', false), false);
});

test('canViewAgreementAction hides approve for wrong partner', () => {
    assert.equal(
        canViewAgreementAction({ role: 'partner', partnerId: 'partner_other' }, createdAgreement, 'approve', true),
        false,
    );
});

test('canViewAgreementAction hides merchant actions for wrong merchant', () => {
    const wrongMerchant = { role: 'merchant' as const, merchantId: 'merchant_other' };

    assert.equal(canViewAgreementAction(wrongMerchant, approvedAgreement, 'fund', true), false);
    assert.equal(canViewAgreementAction(wrongMerchant, fundedAgreement, 'settle', true), false);
});

test('canViewAgreementAction hides all actions for admin', () => {
    const actions: TransitionAction[] = ['approve', 'fund', 'settle'];

    for (const agreement of [createdAgreement, approvedAgreement, fundedAgreement]) {
        for (const action of actions) {
            assert.equal(canViewAgreementAction(adminAuth, agreement, action, true), false);
        }
    }
});
