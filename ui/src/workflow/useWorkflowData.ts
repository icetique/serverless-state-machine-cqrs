import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionIdentity } from '../../../shared/auth-contract';
import type { AgreementSummary, EventRecord, LedgerEntry } from '../types';
import type { WorkflowApi } from './workflowApi';

type UseWorkflowDataArgs = {
    api: WorkflowApi;
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

export const useWorkflowData = ({ api, identity, sessionAccessToken }: UseWorkflowDataArgs): UseWorkflowDataResult => {
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
            const nextAgreements = await api.listAgreements();
            setAgreements(nextAgreements);
            setAgreementsError(null);
            return nextAgreements;
        } finally {
            setIsLoadingAgreements(false);
        }
    }, [api]);

    const updateAgreementStatus = useCallback((agreementId: string, status: AgreementSummary['status']) => {
        setAgreements((prev) => prev.map((a) => (a.agreementId === agreementId ? { ...a, status } : a)));
    }, []);

    const loadEvents = useCallback(async (): Promise<EventRecord[]> => {
        setIsLoadingEvents(true);
        try {
            const nextEvents = await api.listEvents();
            setEvents(nextEvents);
            setEventsError(null);
            return nextEvents;
        } finally {
            setIsLoadingEvents(false);
        }
    }, [api]);

    const loadLedger = useCallback(async (): Promise<LedgerEntry[]> => {
        setIsLoadingLedger(true);
        try {
            const nextEntries = await api.listLedger();
            setLedgerEntries(nextEntries);
            setLedgerError(null);
            return nextEntries;
        } finally {
            setIsLoadingLedger(false);
        }
    }, [api]);

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

        let isMounted = true;

        const id = window.setInterval(() => {
            if (hasFundedRef.current && !isLoadingRef.current) {
                isLoadingRef.current = true;
                void loadAgreementsRef
                    .current()
                    .catch((caughtError) => {
                        if (isMounted) {
                            setAgreementsError(
                                caughtError instanceof Error ? caughtError.message : 'Unknown agreements failure',
                            );
                        }
                    })
                    .finally(() => {
                        isLoadingRef.current = false;
                    });
            }
        }, 10_000);

        return () => {
            isMounted = false;
            window.clearInterval(id);
        };
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
