import { createHash } from 'crypto';
import type { SettleAgreementCommand, ActorType } from '@serverless-state-machine-cqrs/domain';
import { AgreementCommandRepository, TransitionAgreementResult } from '../repository';

export interface SettlementProcessorInput {
    agreementId: string;
    idempotencyKey: string;
    requestId: string;
    triggerSource: string;
    actorId: string;
    actorType: ActorType;
    messageId?: string;
}

export interface SettlementProcessor {
    process(input: SettlementProcessorInput): Promise<TransitionAgreementResult>;
}

const buildSettlementRequestHash = (agreementId: string): string =>
    createHash('sha256')
        .update(JSON.stringify({ agreementId, eventType: 'AgreementSettled' }))
        .digest('hex');

const mapProcessorInputToCommand = (input: SettlementProcessorInput): SettleAgreementCommand => ({
    agreementId: input.agreementId,
    idempotencyKey: input.idempotencyKey,
    requestHash: buildSettlementRequestHash(input.agreementId),
    requestId: input.requestId,
    actorId: input.actorId,
    actorType: input.actorType,
    triggerSource: input.triggerSource,
    messageId: input.messageId,
});

export class DefaultSettlementProcessor implements SettlementProcessor {
    constructor(private readonly repository: AgreementCommandRepository) {}

    async process(input: SettlementProcessorInput): Promise<TransitionAgreementResult> {
        return this.repository.settleAgreement(mapProcessorInputToCommand(input));
    }
}
