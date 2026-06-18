import type { Session } from '@supabase/supabase-js';

export const buildAuthHeaders = (
    session: Session | null,
    headers: Record<string, string> = {},
): Record<string, string> => ({
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    ...headers,
});
