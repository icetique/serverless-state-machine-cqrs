import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { PostgresAgreementRepository } from '../../src/repository';
import { createPool, getDatabaseUrl } from '../../src/lambda-utils';
import { DefaultSettlementProcessor, SettlementProcessor } from '../../src/settlement/settlement-processor';
import { parseSettlementQueueRecordBody } from '../../src/settlement/settlement-message';
import { withSqsFailureSimulation } from '../../src/dev-failure-simulation';

export const createHandler = (processor: SettlementProcessor) => {
    return async (event: SQSEvent): Promise<SQSBatchResponse> => {
        const failures: SQSBatchResponse['batchItemFailures'] = [];

        for (const record of event.Records) {
            try {
                const input = parseSettlementQueueRecordBody(record.body);
                await processor.process({
                    ...input,
                    messageId: input.messageId ?? record.messageId,
                });
            } catch (error) {
                console.error(error);
                failures.push({ itemIdentifier: record.messageId });
            }
        }

        return { batchItemFailures: failures };
    };
};

let defaultHandler: ((event: SQSEvent) => Promise<SQSBatchResponse>) | undefined;

const getDefaultHandler = () => {
    if (!defaultHandler) {
        const repository = new PostgresAgreementRepository(createPool(getDatabaseUrl()));
        const processor = new DefaultSettlementProcessor(repository);
        defaultHandler = withSqsFailureSimulation(createHandler(processor));
    }

    return defaultHandler;
};

export const lambdaHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => getDefaultHandler()(event);
