import type { AgreementResult } from '../../types';

type LatestResponsePanelProps = {
    actionError: string | null;
    authError: string | null;
    error: string | null;
    result: AgreementResult | null;
};

export function LatestResponsePanel({ actionError, authError, error, result }: LatestResponsePanelProps) {
    return (
        <section className="panel response-panel">
            <div className="panel-header">
                <h2>Latest Response</h2>
                <span className="badge muted">JSON</span>
            </div>
            {result ? (
                <pre className="response">{JSON.stringify(result, null, 2)}</pre>
            ) : (
                <div className="empty-state">Run a workflow command to inspect the latest response.</div>
            )}
            {error ? <pre className="response error">{error}</pre> : null}
            {actionError ? <pre className="response error">{actionError}</pre> : null}
            {authError ? <pre className="response error">{authError}</pre> : null}
        </section>
    );
}
