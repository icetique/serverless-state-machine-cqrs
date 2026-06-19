import type { SessionIdentity } from '../../../../../shared/auth-contract';
import { formatMoneyMinorUnits } from '@cqrs/domain';
import { canViewAgreementAction, getActionTone, getStatusTone } from '../../workflow/permissions';
import type { AgreementSummary, TransitionAction } from '../../types';

type AgreementsPanelProps = {
    activeAction: string | null;
    agreements: AgreementSummary[];
    agreementsError: string | null;
    identity: SessionIdentity;
    isLoadingAgreements: boolean;
    isManualSettlementTriggerEnabled: boolean;
    onRefresh: () => void;
    onTransition: (agreement: AgreementSummary, action: TransitionAction) => void;
};

export function AgreementsPanel({
    activeAction,
    agreements,
    agreementsError,
    identity,
    isLoadingAgreements,
    isManualSettlementTriggerEnabled,
    onRefresh,
    onTransition,
}: AgreementsPanelProps) {
    return (
        <section className="panel response-panel">
            <div className="panel-header">
                <h2>Agreements</h2>
                <div className="panel-header-actions">
                    <button
                        className="secondary-button"
                        disabled={isLoadingAgreements}
                        onClick={onRefresh}
                        type="button"
                    >
                        {isLoadingAgreements ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <span className="badge muted">{isLoadingAgreements ? 'Loading…' : 'Scoped Read'}</span>
                </div>
            </div>
            {agreementsError ? <pre className="response error">{agreementsError}</pre> : null}
            {isLoadingAgreements && agreements.length === 0 ? (
                <div className="empty-state">Loading agreements…</div>
            ) : agreements.length === 0 ? (
                <div className="empty-state">No agreements visible for this account yet.</div>
            ) : (
                <div className="agreements-list">
                    {agreements.map((agreement) => (
                        <article className="agreement-card" key={agreement.agreementId}>
                            <div className="event-card-header agreement-card-header">
                                <div>
                                    <strong>{agreement.agreementId}</strong>
                                    <div className="event-meta">
                                        <span>merchant: {agreement.merchantId}</span>
                                        <span>partner: {agreement.partnerId}</span>
                                        <span>amount: {formatMoneyMinorUnits(agreement.amount)}</span>
                                    </div>
                                </div>
                                <span className={`status-pill status-pill--${getStatusTone(agreement.status)}`}>
                                    {agreement.status}
                                </span>
                            </div>

                            {!isManualSettlementTriggerEnabled && agreement.status === 'FUNDED' ? (
                                <div className="response warning" style={{ marginBottom: '10px' }}>
                                    Settlement via SQS pending, ~1 minute. Refreshing every 10 seconds.
                                </div>
                            ) : null}

                            <div className="actions-row">
                                {(['approve', 'fund', 'settle'] as TransitionAction[]).map((action) => {
                                    const isVisible = canViewAgreementAction(
                                        identity,
                                        agreement,
                                        action,
                                        isManualSettlementTriggerEnabled,
                                    );

                                    if (!isVisible) {
                                        return null;
                                    }

                                    const actionKey = `${agreement.agreementId}:${action}`;

                                    return (
                                        <button
                                            className={`secondary-button secondary-button--${getStatusTone(
                                                getActionTone(action),
                                            )}`}
                                            disabled={activeAction === actionKey}
                                            key={action}
                                            onClick={() => onTransition(agreement, action)}
                                            type="button"
                                        >
                                            {activeAction === actionKey
                                                ? `${action[0].toUpperCase()}${action.slice(1)}…`
                                                : action[0].toUpperCase() + action.slice(1)}
                                        </button>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
