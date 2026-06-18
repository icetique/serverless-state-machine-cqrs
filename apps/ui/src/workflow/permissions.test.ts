import { describe, expect, it } from 'vitest';
import {
    adminIdentity,
    approvedAgreement,
    createdAgreement,
    fundedAgreement,
    merchantIdentity,
    partnerIdentity,
    settledAgreement,
} from '../test-support/fixtures';
import { canViewAgreementAction } from './permissions';
import type { TransitionAction } from '../types';

describe('canViewAgreementAction', () => {
    const actions: TransitionAction[] = ['approve', 'fund', 'settle'];

    it.each([
        ['CREATED', 'approve', partnerIdentity, createdAgreement, true],
        ['CREATED', 'fund', merchantIdentity, createdAgreement, false],
        ['CREATED', 'settle', merchantIdentity, createdAgreement, false],
        ['APPROVED', 'fund', merchantIdentity, approvedAgreement, true],
        ['APPROVED', 'approve', partnerIdentity, approvedAgreement, false],
        ['FUNDED', 'settle', merchantIdentity, fundedAgreement, true],
        ['FUNDED', 'approve', partnerIdentity, fundedAgreement, false],
        ['SETTLED', 'settle', merchantIdentity, settledAgreement, false],
    ] as const)('action=%s role=%s expected=%s', (_status, action, identity, agreement, expected) => {
        expect(canViewAgreementAction(identity, agreement, action, true)).toBe(expected);
    });

    it('hides settle on FUNDED when manual settlement trigger is disabled', () => {
        expect(canViewAgreementAction(merchantIdentity, fundedAgreement, 'settle', false)).toBe(false);
    });

    it('hides approve when partner id does not match agreement', () => {
        const wrongPartner = { ...partnerIdentity, partnerId: 'partner_other' };

        expect(canViewAgreementAction(wrongPartner, createdAgreement, 'approve', true)).toBe(false);
    });

    it('hides fund and settle when merchant id does not match agreement', () => {
        const wrongMerchant = { ...merchantIdentity, merchantId: 'merchant_other' };

        expect(canViewAgreementAction(wrongMerchant, approvedAgreement, 'fund', true)).toBe(false);
        expect(canViewAgreementAction(wrongMerchant, fundedAgreement, 'settle', true)).toBe(false);
    });

    it('hides all actions for admin regardless of status', () => {
        for (const agreement of [createdAgreement, approvedAgreement, fundedAgreement]) {
            for (const action of actions) {
                expect(canViewAgreementAction(adminIdentity, agreement, action, true)).toBe(false);
            }
        }
    });
});
