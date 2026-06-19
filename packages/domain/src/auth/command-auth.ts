export type AuthRole = 'merchant' | 'partner' | 'admin';

export interface CommandAuthContext {
    subject: string;
    role: AuthRole;
    merchantId?: string;
    partnerId?: string;
}
