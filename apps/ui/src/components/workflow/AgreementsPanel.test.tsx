import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fundedAgreement, merchantIdentity } from '../../test-support/fixtures';
import { AgreementsPanel } from './AgreementsPanel';

const defaults = {
    activeAction: null,
    agreements: [fundedAgreement],
    agreementsError: null,
    identity: merchantIdentity,
    isLoadingAgreements: false,
    isManualSettlementTriggerEnabled: true,
    onRefresh: vi.fn(),
    onTransition: vi.fn(),
};

describe('AgreementsPanel', () => {
    it('shows warning banner and hides settle when manual settlement is disabled on FUNDED', () => {
        const { container } = render(<AgreementsPanel {...defaults} isManualSettlementTriggerEnabled={false} />);

        expect(container.querySelector('.response.warning')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Settle' })).not.toBeInTheDocument();
    });

    it('hides warning banner and shows settle when manual settlement is enabled on FUNDED', () => {
        const { container } = render(<AgreementsPanel {...defaults} isManualSettlementTriggerEnabled />);

        expect(container.querySelector('.response.warning')).toBeNull();
        expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument();
    });

    it('invokes onRefresh when refresh is clicked', () => {
        const onRefresh = vi.fn();

        render(<AgreementsPanel {...defaults} onRefresh={onRefresh} />);

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

        expect(onRefresh).toHaveBeenCalled();
    });

    it('disables refresh while agreements are loading', () => {
        render(<AgreementsPanel {...defaults} isLoadingAgreements />);

        expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
    });

    it('renders agreement id and domain action buttons', () => {
        render(<AgreementsPanel {...defaults} />);

        expect(screen.getByText('agr_1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument();
    });
});
