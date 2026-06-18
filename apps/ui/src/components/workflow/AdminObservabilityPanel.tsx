import type { EventRecord, LedgerEntry } from '../../types';

type AdminObservabilityPanelProps = {
    events: EventRecord[];
    eventsError: string | null;
    isLoadingEvents: boolean;
    isLoadingLedger: boolean;
    ledgerEntries: LedgerEntry[];
    ledgerError: string | null;
};

export function AdminObservabilityPanel({
    events,
    eventsError,
    isLoadingEvents,
    isLoadingLedger,
    ledgerEntries,
    ledgerError,
}: AdminObservabilityPanelProps) {
    return (
        <section className="grid admin-panel">
            <section className="panel response-panel admin-panel-section">
                <div className="panel-header">
                    <h2>Ledger</h2>
                    <span className="badge muted">{isLoadingLedger ? 'Loading…' : 'Admin Only'}</span>
                </div>
                {ledgerError ? <pre className="response error">{ledgerError}</pre> : null}
                {isLoadingLedger && ledgerEntries.length === 0 ? (
                    <div className="empty-state">Loading ledger…</div>
                ) : ledgerEntries.length === 0 ? (
                    <div className="empty-state">No ledger entries yet.</div>
                ) : (
                    <div className="event-list">
                        {ledgerEntries.map((entry) => (
                            <article className="event-card" key={entry.transactionId}>
                                <div className="event-card-header">
                                    <strong>{entry.transactionId}</strong>
                                    <span>{entry.createdAt}</span>
                                </div>
                                <div className="event-meta">
                                    <span>agreement: {entry.agreementId}</span>
                                    <span>entry: {entry.entryType}</span>
                                    <span>amount: {entry.amount}</span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="panel response-panel admin-panel-section admin-event-stream">
                <div className="panel-header">
                    <h2>Event Stream</h2>
                    <span className="badge muted">{isLoadingEvents ? 'Loading…' : 'Admin Only'}</span>
                </div>
                {eventsError ? <pre className="response error">{eventsError}</pre> : null}
                {isLoadingEvents && events.length === 0 ? (
                    <div className="empty-state">Loading events…</div>
                ) : events.length === 0 ? (
                    <div className="empty-state">No persisted events yet.</div>
                ) : (
                    <div className="event-list">
                        {events.map((event) => (
                            <article className="event-card" key={event.id}>
                                <div className="event-card-header">
                                    <strong>{event.eventType}</strong>
                                    <span>{event.createdAt}</span>
                                </div>
                                <div className="event-meta">
                                    <span>agreement: {event.agreementId}</span>
                                    <span>request: {event.requestId}</span>
                                    <span>idem: {event.idempotencyKey}</span>
                                </div>
                                <pre className="response">{JSON.stringify(event.payload, null, 2)}</pre>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </section>
    );
}
