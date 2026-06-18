import { createHash } from 'crypto';
import { ActorType, AgreementRepository, SettleAgreementInput, TransitionAgreementResult } from '../repository';

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

const mapProcessorInputToRepositoryInput = (input: SettlementProcessorInput): SettleAgreementInput => ({
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
    constructor(private readonly repository: AgreementRepository) {}

    async process(input: SettlementProcessorInput): Promise<TransitionAgreementResult> {
        return this.repository.settleAgreement(mapProcessorInputToRepositoryInput(input));
    }
}
