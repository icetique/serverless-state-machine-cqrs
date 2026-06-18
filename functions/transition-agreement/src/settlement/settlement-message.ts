import { ActorType } from '../repository';
import { SettlementProcessorInput } from './settlement-processor';
import { AgreementEventDetail } from '../lambda-utils';

export interface SettlementQueueMessage {
    agreementId: string;
    idempotencyKey: string;
    requestId: string;
    triggerSource: string;
    actorId: string;
    actorType: ActorType;
    messageId?: string;
}

interface EventBridgeEnvelope<TDetail> {
    id?: string;
    source?: string;
    'detail-type'?: string;
    detail?: TDetail;
}

export const buildSettlementProcessorInputFromMessage = (
    message: SettlementQueueMessage,
): SettlementProcessorInput => ({
    agreementId: message.agreementId,
    idempotencyKey: message.idempotencyKey,
    requestId: message.requestId,
    triggerSource: message.triggerSource,
    actorId: message.actorId,
    actorType: message.actorType,
    messageId: message.messageId,
});

const isSettlementQueueMessage = (value: unknown): value is SettlementQueueMessage => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<SettlementQueueMessage>;
    return (
        typeof candidate.agreementId === 'string' &&
        typeof candidate.idempotencyKey === 'string' &&
        typeof candidate.requestId === 'string' &&
        typeof candidate.triggerSource === 'string' &&
        typeof candidate.actorId === 'string' &&
        (candidate.actorType === 'merchant' ||
            candidate.actorType === 'partner' ||
            candidate.actorType === 'admin' ||
            candidate.actorType === 'system')
    );
};

const isAgreementFundedEnvelope = (value: unknown): value is EventBridgeEnvelope<AgreementEventDetail> => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as EventBridgeEnvelope<AgreementEventDetail>;
    return (
        candidate['detail-type'] === 'AgreementFunded' &&
        typeof candidate.id === 'string' &&
        !!candidate.detail &&
        typeof candidate.detail.agreementId === 'string'
    );
};

export const buildSettlementProcessorInputFromFundedEvent = (
    envelope: EventBridgeEnvelope<AgreementEventDetail>,
): SettlementProcessorInput => ({
    agreementId: envelope.detail!.agreementId,
    idempotencyKey: `evt_${envelope.id}`,
    requestId: envelope.id!,
    triggerSource: 'eventbridge_agreement_funded',
    actorId: 'settlement_processor',
    actorType: 'system',
    messageId: envelope.id,
});

export const parseSettlementQueueRecordBody = (body: string): SettlementProcessorInput => {
    const parsed = JSON.parse(body) as unknown;

    if (isSettlementQueueMessage(parsed)) {
        return buildSettlementProcessorInputFromMessage(parsed);
    }

    if (isAgreementFundedEnvelope(parsed)) {
        return buildSettlementProcessorInputFromFundedEvent(parsed);
    }

    throw new Error('Unsupported settlement queue message body');
};
