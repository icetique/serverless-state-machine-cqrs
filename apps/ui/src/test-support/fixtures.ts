import type { SessionIdentity } from '../../../../shared/auth-contract';
import type { AgreementResult, AgreementSummary } from '../types';
import type { WorkflowApi } from '../workflow/workflowApi';
import { vi } from 'vitest';

export const merchantIdentity: SessionIdentity = {
    email: 'merchant_1@example.com',
    merchantId: 'merchant_1',
    role: 'merchant',
    subject: 'merchant-sub',
};

export const partnerIdentity: SessionIdentity = {
    email: 'partner_2@example.com',
    partnerId: 'partner_2',
    role: 'partner',
    subject: 'partner-sub',
};

export const adminIdentity: SessionIdentity = {
    email: 'admin_1@example.com',
    role: 'admin',
    subject: 'admin-sub',
};

export const fundedAgreement: AgreementSummary = {
    agreementId: 'agr_1',
    amount: 1000,
    createdAt: '2026-06-06T00:00:00Z',
    merchantId: 'merchant_1',
    partnerId: 'partner_2',
    status: 'FUNDED',
};

export const createdAgreement: AgreementSummary = {
    agreementId: 'agr_2',
    amount: 500,
    createdAt: '2026-06-06T00:00:00Z',
    merchantId: 'merchant_1',
    partnerId: 'partner_2',
    status: 'CREATED',
};

export const approvedAgreement: AgreementSummary = {
    agreementId: 'agr_3',
    amount: 750,
    createdAt: '2026-06-06T00:00:00Z',
    merchantId: 'merchant_1',
    partnerId: 'partner_2',
    status: 'APPROVED',
};

export const settledAgreement: AgreementSummary = {
    agreementId: 'agr_4',
    amount: 2000,
    createdAt: '2026-06-06T00:00:00Z',
    merchantId: 'merchant_1',
    partnerId: 'partner_2',
    status: 'SETTLED',
};

export const makeAgreementResult = (): AgreementResult => ({
    agreementId: 'agr_new',
    merchantId: 'merchant_1',
    partnerId: 'partner_2',
    amount: 1000,
    status: 'CREATED',
});

export const makeMockWorkflowApi = (overrides: Partial<WorkflowApi> = {}): WorkflowApi => ({
    listAgreements: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
    listLedger: vi.fn(async () => []),
    createAgreement: vi.fn(async () => makeAgreementResult()),
    transitionAgreement: vi.fn(async () => ({
        agreementId: 'agr_1',
        merchantId: 'merchant_1',
        partnerId: 'partner_2',
        amount: 1000,
        newStatus: 'SETTLED',
    })),
    ...overrides,
});
