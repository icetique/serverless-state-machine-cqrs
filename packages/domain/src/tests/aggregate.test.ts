import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildCreatedEventDetail,
    decideCreate,
    decideSettlement,
    decideTransition,
    emptyAggregate,
    fromEvents,
    type StreamEventRecord,
} from '../aggregate/agreement';

const createdEvent = (overrides: Partial<StreamEventRecord> = {}): StreamEventRecord => ({
    streamVersion: 1,
    eventType: 'AgreementCreated',
    payload: buildCreatedEventDetail({
        agreementId: 'agr_1',
        merchantId: 'merchant_1',
        partnerId: 'partner_2',
        amount: 1000,
    }),
    ...overrides,
});

const transitionEvent = (
    streamVersion: number,
    eventType: 'AgreementApproved' | 'AgreementFunded' | 'AgreementSettled',
    from: 'CREATED' | 'APPROVED' | 'FUNDED',
    to: 'APPROVED' | 'FUNDED' | 'SETTLED',
    extra: { transactionId?: string } = {},
): StreamEventRecord => ({
    streamVersion,
    eventType,
    payload: {
        agreementId: 'agr_1',
        merchantId: 'merchant_1',
        partnerId: 'partner_2',
        amount: 1000,
        previousStatus: from,
        newStatus: to,
        ...extra,
    },
});

test('replays empty stream', () => {
    assert.deepEqual(fromEvents([]), { state: null, version: 0 });
});

test('replays create through settle', () => {
    const events = [
        createdEvent(),
        transitionEvent(2, 'AgreementApproved', 'CREATED', 'APPROVED'),
        transitionEvent(3, 'AgreementFunded', 'APPROVED', 'FUNDED'),
        transitionEvent(4, 'AgreementSettled', 'FUNDED', 'SETTLED', { transactionId: 'txn_1' }),
    ];

    const aggregate = fromEvents(events);

    assert.equal(aggregate.version, 4);
    assert.deepEqual(aggregate.state, {
        agreementId: 'agr_1',
        status: 'SETTLED',
        merchantId: 'merchant_1',
        partnerId: 'partner_2',
        amount: 1000,
    });
});

test('decideCreate on empty stream', () => {
    const result = decideCreate(emptyAggregate(), {
        agreementId: 'agr_new',
        merchantId: 'merchant_1',
        partnerId: 'partner_2',
        amount: 500,
    });

    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
        assert.equal(result.event.eventType, 'AgreementCreated');
        assert.equal(result.event.streamVersion, 1);
    }
});

test('decideCreate rejects non-empty stream', () => {
    const result = decideCreate(fromEvents([createdEvent()]), {
        agreementId: 'agr_1',
        merchantId: 'merchant_1',
        partnerId: 'partner_2',
        amount: 1000,
    });

    assert.deepEqual(result, { kind: 'stream_exists' });
});

test('decideTransition rejects invalid transition', () => {
    const aggregate = fromEvents([createdEvent()]);
    const result = decideTransition(aggregate, 'AgreementFunded');

    assert.deepEqual(result, { kind: 'invalid_transition', currentStatus: 'CREATED' });
});

test('decideTransition accepts valid transition', () => {
    const aggregate = fromEvents([createdEvent()]);
    const result = decideTransition(aggregate, 'AgreementApproved');

    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
        assert.equal(result.event.payload.newStatus, 'APPROVED');
        assert.equal(result.event.streamVersion, 2);
    }
});

test('decideTransition detects version conflict', () => {
    const aggregate = fromEvents([createdEvent()]);
    const result = decideTransition(aggregate, 'AgreementApproved', 5);

    assert.deepEqual(result, {
        kind: 'version_conflict',
        expectedVersion: 5,
        actualVersion: 1,
    });
});

test('decideSettlement attaches transactionId', () => {
    const aggregate = fromEvents([
        createdEvent(),
        transitionEvent(2, 'AgreementApproved', 'CREATED', 'APPROVED'),
        transitionEvent(3, 'AgreementFunded', 'APPROVED', 'FUNDED'),
    ]);

    const result = decideSettlement(aggregate, 'txn_settle');

    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
        assert.equal(result.event.payload.transactionId, 'txn_settle');
        assert.equal(result.event.payload.newStatus, 'SETTLED');
    }
});
