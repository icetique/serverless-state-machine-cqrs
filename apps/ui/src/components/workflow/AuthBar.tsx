import type { SessionIdentity } from '../../../../../shared/auth-contract';
import { formatRoleLabel, identitySummary } from '../../auth/sessionIdentity';

type AuthBarProps = {
    identity: SessionIdentity;
    isSigningOut: boolean;
    onSignOut: () => void;
};

export function AuthBar({ identity, isSigningOut, onSignOut }: AuthBarProps) {
    return (
        <div className="panel auth-bar">
            <div className="auth-summary">
                <strong>{identity.email ?? identity.subject}</strong>
                <span>{formatRoleLabel(identity.role)}</span>
                <small className="session-meta">{identitySummary(identity)}</small>
            </div>
            <div className="auth-actions">
                <span className="badge muted">Supabase JWT</span>
                <button className="secondary-button" disabled={isSigningOut} onClick={onSignOut} type="button">
                    {isSigningOut ? 'Signing Out…' : 'Sign Out'}
                </button>
            </div>
        </div>
    );
}
