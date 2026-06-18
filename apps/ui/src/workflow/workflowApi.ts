import { createAgreementsApi } from './agreementsApi';
import { type ApiConfig } from './client';
import { createObservabilityApi } from './observabilityApi';

export const createWorkflowApi = (config: ApiConfig) => ({
    ...createAgreementsApi(config),
    ...createObservabilityApi(config),
});

export type WorkflowApi = ReturnType<typeof createWorkflowApi>;
