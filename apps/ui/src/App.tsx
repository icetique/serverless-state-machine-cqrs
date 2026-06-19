import { useCallback, useMemo, type FormEvent } from 'react';
import { demoAccounts } from './auth/demoAccounts';
import { isSupabaseConfigured, supabase } from './auth/supabaseClient';
import { useSupabaseSession } from './auth/useSupabaseSession';
import { LoginPanel } from './components/LoginPanel';
import { WorkflowDashboard } from './components/WorkflowDashboard';
import type { AgreementSummary, TransitionAction } from './types';
import { buildAuthHeaders } from './workflow/api';
import { useAgreementCommands } from './workflow/useAgreementCommands';
import { useWorkflowData } from './workflow/useWorkflowData';
import { createWorkflowApi } from './workflow/workflowApi';

export default function App() {
    const apiBaseUrl = useMemo(() => {
        const configured = import.meta.env.VITE_API_BASE_URL?.trim();
        return configured ? configured : '/api';
    }, []);
    const isManualSettlementTriggerEnabled = useMemo(
        () => (import.meta.env.VITE_ENABLE_MANUAL_SETTLEMENT_TRIGGER ?? 'false') === 'true',
        [],
    );
    const {
        authError,
        authReady,
        email,
        identity,
        isAuthenticating,
        isSigningOut,
        password,
        session,
        setEmail,
        setPassword,
        signIn,
        signOut,
    } = useSupabaseSession(supabase);
    const buildHeaders = useCallback(
        (headers: Record<string, string> = {}) => buildAuthHeaders(session, headers),
        [session],
    );
    const workflowApi = useMemo(() => createWorkflowApi({ apiBaseUrl, buildHeaders }), [apiBaseUrl, buildHeaders]);
    const {
        agreements,
        agreementsError,
        events,
        eventsError,
        isLoadingAgreements,
        isLoadingEvents,
        isLoadingLedger,
        ledgerEntries,
        ledgerError,
        loadAgreements,
        loadEvents,
        loadLedger,
        refresh,
        updateAgreementStatus,
    } = useWorkflowData({
        api: workflowApi,
        identity,
        sessionAccessToken: session?.access_token ?? null,
    });
    const {
        actionError,
        activeAction,
        error,
        form,
        idempotencyKey,
        isSubmitting,
        onAmountChange,
        resetForSignOut,
        result,
        runCreateAgreement,
        runTransition,
    } = useAgreementCommands({
        api: workflowApi,
        identity,
        isManualSettlementTriggerEnabled,
        loadAgreements,
        loadEvents,
        loadLedger,
        updateAgreementStatus,
    });

    const handleSignOut = async () => {
        await signOut(() => {
            resetForSignOut();
        });
    };

    const handleCreateAgreement = async (event: FormEvent<HTMLFormElement>) => {
        await runCreateAgreement(event);
    };

    const handleTransition = async (agreement: AgreementSummary, action: TransitionAction) => {
        await runTransition(agreement, action);
    };

    if (!authReady) {
        return (
            <main className="shell">
                <section className="panel form-panel">
                    <div className="empty-state">Bootstrapping Supabase session…</div>
                </section>
            </main>
        );
    }

    if (!isSupabaseConfigured) {
        return (
            <main className="shell">
                <section className="panel form-panel">
                    <div className="panel-header">
                        <h2>Supabase Config Required</h2>
                        <span className="badge muted">Blocked</span>
                    </div>
                    <p className="lede">
                        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> before starting the
                        UI.
                    </p>
                    {authError ? <pre className="response error">{authError}</pre> : null}
                </section>
            </main>
        );
    }

    if (!session || !identity) {
        return (
            <LoginPanel
                authError={authError}
                demoAccounts={demoAccounts}
                email={email}
                isAuthenticating={isAuthenticating}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onPrefillDemoAccount={(account) => {
                    setEmail(account.email);
                    setPassword(account.password);
                }}
                onSubmit={(event) => {
                    event.preventDefault();
                    void signIn();
                }}
                password={password}
            />
        );
    }

    return (
        <WorkflowDashboard
            actionError={actionError}
            activeAction={activeAction}
            agreements={agreements}
            agreementsError={agreementsError}
            authError={authError}
            error={error}
            events={events}
            eventsError={eventsError}
            form={form}
            idempotencyKey={idempotencyKey}
            identity={identity}
            isLoadingAgreements={isLoadingAgreements}
            isLoadingEvents={isLoadingEvents}
            isLoadingLedger={isLoadingLedger}
            isManualSettlementTriggerEnabled={isManualSettlementTriggerEnabled}
            isSigningOut={isSigningOut}
            isSubmitting={isSubmitting}
            ledgerEntries={ledgerEntries}
            ledgerError={ledgerError}
            onAmountChange={onAmountChange}
            onCreateAgreement={(event) => void handleCreateAgreement(event)}
            onRefresh={refresh}
            onSignOut={() => void handleSignOut()}
            onTransition={(agreement, action) => void handleTransition(agreement, action)}
            result={result}
        />
    );
}
