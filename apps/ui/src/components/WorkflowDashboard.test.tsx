import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    adminIdentity,
    createdAgreement,
    fundedAgreement,
    makeAgreementResult,
    merchantIdentity,
    partnerIdentity,
} from '../test-support/fixtures';
import { WorkflowDashboard } from './WorkflowDashboard';
const defaults: ComponentProps<typeof WorkflowDashboard> = {
    actionError: null,
    activeAction: null,
    agreements: [fundedAgreement],
    agreementsError: null,
    authError: null,
    error: null,
    events: [],
    eventsError: null,
    form: { amount: '1000', merchantId: 'merchant_1', partnerId: 'partner_2' },
    idempotencyKey: 'create-key-1',
    identity: merchantIdentity,
    isLoadingAgreements: false,
    isLoadingEvents: false,
    isLoadingLedger: false,
    isManualSettlementTriggerEnabled: true,
    isSigningOut: false,
    isSubmitting: false,
    ledgerEntries: [],
    ledgerError: null,
    onAmountChange: () => undefined,
    onCreateAgreement: () => undefined,
    onPartnerIdChange: () => undefined,
    onRefresh: () => undefined,
    onSignOut: () => undefined,
    onTransition: () => undefined,
    result: null,
};

const renderDashboard = (overrides: Partial<ComponentProps<typeof WorkflowDashboard>> = {}) =>
    render(<WorkflowDashboard {...defaults} {...overrides} />);

describe('WorkflowDashboard', () => {
    it('shows the create agreement form only for merchants', () => {
        const { rerender } = renderDashboard();

        expect(screen.getByRole('heading', { name: 'Create Agreement' })).toBeInTheDocument();

        rerender(<WorkflowDashboard {...defaults} identity={adminIdentity} />);

        expect(screen.queryByRole('heading', { name: 'Create Agreement' })).not.toBeInTheDocument();
    });

    it('disables the create button while submitting', () => {
        renderDashboard({ isSubmitting: true });

        expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    });

    it('shows a loading state instead of an empty agreements panel while data is fetching', () => {
        renderDashboard({
            agreements: [],
            isLoadingAgreements: true,
        });

        expect(screen.getByText('Loading agreements…')).toBeInTheDocument();
        expect(screen.queryByText('No agreements visible for this account yet.')).not.toBeInTheDocument();
    });

    it('shows an empty state when there are no agreements', () => {
        renderDashboard({
            agreements: [],
            isLoadingAgreements: false,
        });

        expect(screen.getByText('No agreements visible for this account yet.')).toBeInTheDocument();
    });

    it('shows the response JSON when a result is present', () => {
        const result = makeAgreementResult();
        renderDashboard({ result });

        expect(screen.getByText(/agr_new/)).toBeInTheDocument();
    });

    it('shows an agreements error message', () => {
        renderDashboard({ agreementsError: 'Failed to fetch' });

        expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });

    it('shows an action error message', () => {
        renderDashboard({ actionError: 'You may not settle this agreement' });

        expect(screen.getByText('You may not settle this agreement')).toBeInTheDocument();
    });

    it('shows an auth error message', () => {
        renderDashboard({ authError: 'Session expired' });

        expect(screen.getByText('Session expired')).toBeInTheDocument();
    });

    describe('action buttons', () => {
        it('shows Settle for the merchant when the agreement is FUNDED', () => {
            renderDashboard();

            expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument();
        });

        it('hides Settle when manual settlement trigger is disabled', () => {
            renderDashboard({ isManualSettlementTriggerEnabled: false });

            expect(screen.queryByRole('button', { name: 'Settle' })).not.toBeInTheDocument();
        });

        it('shows Approve for the partner when the agreement is CREATED', () => {
            renderDashboard({
                agreements: [createdAgreement],
                identity: partnerIdentity,
            });

            expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
        });

        it('hides action buttons that are not valid for the current status', () => {
            renderDashboard({
                agreements: [createdAgreement],
                identity: partnerIdentity,
            });

            // CREATED → partner can only Approve, not Fund or Settle
            expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Fund' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Settle' })).not.toBeInTheDocument();
        });

        it('disables a transition button while it is active', () => {
            renderDashboard({
                activeAction: 'agr_1:settle',
            });

            expect(screen.getByRole('button', { name: 'Settle…' })).toBeDisabled();
        });
    });

    describe('admin panels', () => {
        it('shows ledger and event stream panels for admin', () => {
            renderDashboard({
                identity: adminIdentity,
            });

            expect(screen.getByRole('heading', { name: 'Ledger' })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Event Stream' })).toBeInTheDocument();
        });

        it('hides ledger and event stream panels for non-admin', () => {
            renderDashboard({ identity: partnerIdentity });

            expect(screen.queryByRole('heading', { name: 'Ledger' })).not.toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: 'Event Stream' })).not.toBeInTheDocument();
        });

        it('shows loading states for admin panels while fetching', () => {
            renderDashboard({
                identity: adminIdentity,
                isLoadingLedger: true,
                isLoadingEvents: true,
                ledgerEntries: [],
                events: [],
            });

            expect(screen.getByText('Loading ledger…')).toBeInTheDocument();
            expect(screen.getByText('Loading events…')).toBeInTheDocument();
        });

        it('shows ledger error and events error', () => {
            renderDashboard({
                identity: adminIdentity,
                ledgerError: 'Ledger query failed',
                eventsError: 'Events query failed',
            });

            expect(screen.getByText('Ledger query failed')).toBeInTheDocument();
            expect(screen.getByText('Events query failed')).toBeInTheDocument();
        });

        it('shows empty states for admin panels when there is no data', () => {
            renderDashboard({
                identity: adminIdentity,
                isLoadingLedger: false,
                isLoadingEvents: false,
                ledgerEntries: [],
                events: [],
            });

            expect(screen.getByText('No ledger entries yet.')).toBeInTheDocument();
            expect(screen.getByText('No persisted events yet.')).toBeInTheDocument();
        });
    });
});
