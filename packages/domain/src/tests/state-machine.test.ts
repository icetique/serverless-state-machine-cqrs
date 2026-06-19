import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    assertTransitionConfig,
    authorizeTransition,
    canRunAction,
    DomainAuthorizationError,
    getActionTargetStatus,
    getSpecForAction,
    InvalidTransitionError,
    TRANSITION_ACTION_EVENT_TYPES,
    validateTransition,
} from '../state-machine';

test('validateTransition rejects CREATED to FUNDED', () => {
    const result = validateTransition('AgreementFunded', 'CREATED');
    assert.ok(result instanceof InvalidTransitionError);
});

test('validateTransition accepts APPROVED to FUNDED', () => {
    const result = validateTransition('AgreementFunded', 'APPROVED');
    assert.equal(result instanceof InvalidTransitionError, false);
    if (!(result instanceof InvalidTransitionError)) {
        assert.equal(result.to, 'FUNDED');
    }
});

test('assertTransitionConfig rejects mismatched env config', () => {
    assert.throws(
        () => assertTransitionConfig('AgreementApproved', 'APPROVED', 'FUNDED'),
        InvalidTransitionError,
    );
});

test('authorizeTransition rejects merchant approving', () => {
    assert.throws(
        () =>
            authorizeTransition(
                { role: 'merchant', merchantId: 'merchant_1' },
                {
                    agreementId: 'agr_1',
                    status: 'CREATED',
                    merchantId: 'merchant_1',
                    partnerId: 'partner_2',
                },
                'AgreementApproved',
            ),
        DomainAuthorizationError,
    );
});

test('authorizeTransition allows partner on own agreement', () => {
    assert.doesNotThrow(() =>
        authorizeTransition(
            { role: 'partner', partnerId: 'partner_2' },
            {
                agreementId: 'agr_1',
                status: 'CREATED',
                merchantId: 'merchant_1',
                partnerId: 'partner_2',
            },
            'AgreementApproved',
        ),
    );
});

test('canRunAction matches lifecycle', () => {
    assert.equal(canRunAction('CREATED', 'approve'), true);
    assert.equal(canRunAction('CREATED', 'fund'), false);
    assert.equal(canRunAction('APPROVED', 'fund'), true);
    assert.equal(canRunAction('FUNDED', 'settle'), true);
});

test('action helpers derive from AGREEMENT_TRANSITIONS', () => {
    for (const action of Object.keys(TRANSITION_ACTION_EVENT_TYPES) as Array<
        keyof typeof TRANSITION_ACTION_EVENT_TYPES
    >) {
        const spec = getSpecForAction(action);
        assert.equal(getActionTargetStatus(action), spec.to);
        assert.equal(canRunAction(spec.from, action), true);
        assert.equal(canRunAction(spec.to, action), false);
    }
});
