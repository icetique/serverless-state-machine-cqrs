import type { EventRecord, LedgerEntry } from '../types';
import { type ApiConfig, requestJson } from './client';

type ListEventsResponse = {
    events?: EventRecord[];
};

type ListLedgerResponse = {
    entries?: LedgerEntry[];
};

export const createObservabilityApi = (config: ApiConfig) => ({
    listEvents: async (limit = 10): Promise<EventRecord[]> => {
        const body = await requestJson<ListEventsResponse>(config, {
            path: `/debug/events?limit=${limit}`,
        });

        return body.events ?? [];
    },

    listLedger: async (limit = 10): Promise<LedgerEntry[]> => {
        const body = await requestJson<ListLedgerResponse>(config, {
            path: `/ledger?limit=${limit}`,
        });

        return body.entries ?? [];
    },
});

export type ObservabilityApi = ReturnType<typeof createObservabilityApi>;
