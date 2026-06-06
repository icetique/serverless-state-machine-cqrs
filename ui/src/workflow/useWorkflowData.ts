import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionIdentity } from '../../../shared/auth-contract';
import type { AgreementSummary, EventRecord, LedgerEntry } from '../types';

type UseWorkflowDataArgs = {
    apiBaseUrl: string;
    buildHeaders: (headers?: Record<string, string>) => Record<string, string>;
    identity: SessionIdentity | null;
    sessionAccessToken: string | null;
};

type UseWorkflowDataResult = {
    agreements: AgreementSummary[];
    agreementsError: string | null;
    events: EventRecord[];
    eventsError: string | null;
    isLoadingAgreements: boolean;
    isLoadingEvents: boolean;
    isLoadingLedger: boolean;
    ledgerEntries: LedgerEntry[];
    ledgerError: string | null;
    loadAgreements: () => Promise<AgreementSummary[]>;
    loadEvents: () => Promise<EventRecord[]>;
    loadLedger: () => Promise<LedgerEntry[]>;
    refresh: () => void;
    updateAgreementStatus: (agreementId: string, status: AgreementSummary['status']) => void;
};

export const useWorkflowData = ({
    apiBaseUrl,
    buildHeaders,
    identity,
    sessionAccessToken,
}: UseWorkflowDataArgs): UseWorkflowDataResult => {
    const [agreements, setAgreements] = useState<AgreementSummary[]>([]);
    const [agreementsError, setAgreementsError] = useState<string | null>(null);
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [eventsError, setEventsError] = useState<string | null>(null);
    const [isLoadingAgreements, setIsLoadingAgreements] = useState(false);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [isLoadingLedger, setIsLoadingLedger] = useState(false);
    const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
    const [ledgerError, setLedgerError] = useState<string | null>(null);

    const loadAgreements = useCallback(async (): Promise<AgreementSummary[]> => {
        setIsLoadingAgreements(true);
        try {
            const response = await fetch(`${apiBaseUrl}/agreements?limit=10`, {
                headers: buildHeaders(),
            });
            const body = (await response.json()) as { agreements?: AgreementSummary[]; message?: string };

            if (!response.ok) {
                throw new Error(body.message ?? 'Failed to load agreements');
            }

            const nextAgreements = body.agreements ?? [];
            setAgreements(nextAgreements);
            setAgreementsError(null);
            return nextAgreements;
        } finally {
            setIsLoadingAgreements(false);
        }
    }, [apiBaseUrl, buildHeaders]);

    const updateAgreementStatus = useCallback((agreementId: string, status: AgreementSummary['status']) => {
        setAgreements((prev) => prev.map((a) => (a.agreementId === agreementId ? { ...a, status } : a)));
    }, []);

    const loadEvents = useCallback(async (): Promise<EventRecord[]> => {
        setIsLoadingEvents(true);
        try {
            const response = await fetch(`${apiBaseUrl}/debug/events?limit=10`, {
                headers: buildHeaders(),
            });
            const body = (await response.json()) as { events?: EventRecord[]; message?: string };

            if (!response.ok) {
                throw new Error(body.message ?? 'Failed to load events');
            }

            const nextEvents = body.events ?? [];
            setEvents(nextEvents);
            setEventsError(null);
            return nextEvents;
        } finally {
            setIsLoadingEvents(false);
        }
    }, [apiBaseUrl, buildHeaders]);

    const loadLedger = useCallback(async (): Promise<LedgerEntry[]> => {
        setIsLoadingLedger(true);
        try {
            const response = await fetch(`${apiBaseUrl}/ledger?limit=10`, {
                headers: buildHeaders(),
            });
            const body = (await response.json()) as { entries?: LedgerEntry[]; message?: string };

            if (!response.ok) {
                throw new Error(body.message ?? 'Failed to load ledger');
            }

            const nextEntries = body.entries ?? [];
            setLedgerEntries(nextEntries);
            setLedgerError(null);
            return nextEntries;
        } finally {
            setIsLoadingLedger(false);
        }
    }, [apiBaseUrl, buildHeaders]);

    useEffect(() => {
        if (!sessionAccessToken || !identity) {
            setAgreements([]);
            setAgreementsError(null);
            setEvents([]);
            setEventsError(null);
            setLedgerEntries([]);
            setLedgerError(null);
            setIsLoadingAgreements(false);
            setIsLoadingEvents(false);
            setIsLoadingLedger(false);
            return;
        }

        let isMounted = true;

        const safeLoadAgreements = async () => {
            try {
                if (isMounted) {
                    await loadAgreements();
                }
            } catch (caughtError) {
                if (isMounted) {
                    setAgreementsError(
                        caughtError instanceof Error ? caughtError.message : 'Unknown agreements failure',
                    );
                }
            }
        };

        const safeLoadEvents = async () => {
            try {
                if (isMounted && identity.role === 'admin') {
                    await loadEvents();
                }
            } catch (caughtError) {
                if (isMounted) {
                    setEventsError(caughtError instanceof Error ? caughtError.message : 'Unknown events failure');
                }
            }
        };

        const safeLoadLedger = async () => {
            try {
                if (isMounted && identity.role === 'admin') {
                    await loadLedger();
                }
            } catch (caughtError) {
                if (isMounted) {
                    setLedgerError(caughtError instanceof Error ? caughtError.message : 'Unknown ledger failure');
                }
            }
        };

        void safeLoadAgreements();
        if (identity.role === 'admin') {
            void safeLoadEvents();
            void safeLoadLedger();
        } else {
            setEvents([]);
            setEventsError(null);
            setLedgerEntries([]);
            setLedgerError(null);
        }

        return () => {
            isMounted = false;
        };
    }, [identity, loadAgreements, loadEvents, loadLedger, sessionAccessToken]);

    // Auto-poll every 10s while any agreement is FUNDED (waiting for settlement)
    const hasFundedRef = useRef(false);
    hasFundedRef.current = agreements.some((a) => a.status === 'FUNDED');
    const loadAgreementsRef = useRef(loadAgreements);
    loadAgreementsRef.current = loadAgreements;
    const isLoadingRef = useRef(false);

    useEffect(() => {
        if (!sessionAccessToken) {
            return;
        }

        const id = window.setInterval(() => {
            if (hasFundedRef.current && !isLoadingRef.current) {
                isLoadingRef.current = true;
                void loadAgreementsRef
                    .current()
                    .catch(() => {})
                    .finally(() => {
                        isLoadingRef.current = false;
                    });
            }
        }, 10_000);

        return () => window.clearInterval(id);
        // One interval for the lifetime of the session — reads refs each tick
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionAccessToken]);

    const refresh = useCallback(() => {
        void loadAgreements().catch((err) =>
            setAgreementsError(err instanceof Error ? err.message : 'Unknown agreements failure'),
        );

        if (identity?.role === 'admin') {
            void loadEvents().catch((err) =>
                setEventsError(err instanceof Error ? err.message : 'Unknown events failure'),
            );
            void loadLedger().catch((err) =>
                setLedgerError(err instanceof Error ? err.message : 'Unknown ledger failure'),
            );
        }
    }, [identity, loadAgreements, loadEvents, loadLedger]);

    return {
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
    };
};
