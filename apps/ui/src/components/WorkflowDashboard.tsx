import type { FormEvent } from 'react';
import type { SessionIdentity } from '../../../../shared/auth-contract';
import type {
    AgreementResult,
    AgreementSummary,
    EventRecord,
    FormState,
    LedgerEntry,
    TransitionAction,
} from '../types';
import { AdminObservabilityPanel } from './workflow/AdminObservabilityPanel';
import { AgreementsPanel } from './workflow/AgreementsPanel';
import { AuthBar } from './workflow/AuthBar';
import { CreateAgreementPanel } from './workflow/CreateAgreementPanel';
import { LatestResponsePanel } from './workflow/LatestResponsePanel';

type WorkflowDashboardProps = {
    actionError: string | null;
    activeAction: string | null;
    agreements: AgreementSummary[];
    agreementsError: string | null;
    authError: string | null;
    error: string | null;
    events: EventRecord[];
    eventsError: string | null;
    form: FormState;
    idempotencyKey: string;
    identity: SessionIdentity;
    isLoadingAgreements: boolean;
    isLoadingEvents: boolean;
    isLoadingLedger: boolean;
    isManualSettlementTriggerEnabled: boolean;
    isSigningOut: boolean;
    isSubmitting: boolean;
    ledgerEntries: LedgerEntry[];
    ledgerError: string | null;
    onAmountChange: (value: string) => void;
    onCreateAgreement: (event: FormEvent<HTMLFormElement>) => void;
    onRefresh: () => void;
    onSignOut: () => void;
    onTransition: (agreement: AgreementSummary, action: TransitionAction) => void;
    result: AgreementResult | null;
};

export function WorkflowDashboard({
    actionError,
    activeAction,
    agreements,
    agreementsError,
    authError,
    error,
    events,
    eventsError,
    form,
    idempotencyKey,
    identity,
    isLoadingAgreements,
    isLoadingEvents,
    isLoadingLedger,
    isManualSettlementTriggerEnabled,
    isSigningOut,
    isSubmitting,
    ledgerEntries,
    ledgerError,
    onAmountChange,
    onCreateAgreement,
    onRefresh,
    onSignOut,
    onTransition,
    result,
}: WorkflowDashboardProps) {
    const isMerchant = identity.role === 'merchant';
    const isAdmin = identity.role === 'admin';

    return (
        <main className="shell">
            <header className="hero">
                <AuthBar identity={identity} isSigningOut={isSigningOut} onSignOut={onSignOut} />
                <p className="eyebrow">Payments Example</p>
                <h1>Agreement Workflow Control Plane</h1>
                <p className="lede">
                    Create agreements, advance them through approval, funding, and settlement, and inspect the event
                    stream and ledger with admin-scoped access.
                </p>
            </header>

            <section className="grid">
                <div className="merchant-stack">
                    {isMerchant ? (
                        <CreateAgreementPanel
                            form={form}
                            idempotencyKey={idempotencyKey}
                            isSubmitting={isSubmitting}
                            onAmountChange={onAmountChange}
                            onCreateAgreement={onCreateAgreement}
                        />
                    ) : null}

                    <LatestResponsePanel
                        actionError={actionError}
                        authError={authError}
                        error={error}
                        result={result}
                    />
                </div>

                <AgreementsPanel
                    activeAction={activeAction}
                    agreements={agreements}
                    agreementsError={agreementsError}
                    identity={identity}
                    isLoadingAgreements={isLoadingAgreements}
                    isManualSettlementTriggerEnabled={isManualSettlementTriggerEnabled}
                    onRefresh={onRefresh}
                    onTransition={onTransition}
                />
            </section>

            {isAdmin ? (
                <AdminObservabilityPanel
                    events={events}
                    eventsError={eventsError}
                    isLoadingEvents={isLoadingEvents}
                    isLoadingLedger={isLoadingLedger}
                    ledgerEntries={ledgerEntries}
                    ledgerError={ledgerError}
                />
            ) : null}
        </main>
    );
}
