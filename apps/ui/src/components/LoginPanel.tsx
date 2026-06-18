import type { FormEvent } from 'react';
import type { DemoAccount } from '../types';

type LoginPanelProps = {
    authError: string | null;
    demoAccounts: DemoAccount[];
    email: string;
    isAuthenticating: boolean;
    onEmailChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onPrefillDemoAccount: (account: DemoAccount) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    password: string;
};

export function LoginPanel({
    authError,
    demoAccounts,
    email,
    isAuthenticating,
    onEmailChange,
    onPasswordChange,
    onPrefillDemoAccount,
    onSubmit,
    password,
}: LoginPanelProps) {
    return (
        <main className="shell">
            <header className="hero">
                <p className="eyebrow">Payments Example</p>
                <h1>Sign In To Run The Workflow</h1>
                <p className="lede">
                    Sign in with a merchant, partner, or admin account to operate the agreement workflow and inspect
                    role-scoped views.
                </p>
            </header>

            <section className="panel form-panel auth-form-panel">
                <div className="panel-header">
                    <h2>Supabase Auth</h2>
                    <span className="badge">JWT</span>
                </div>
                {demoAccounts.length > 0 ? (
                    <div className="demo-accounts">
                        <strong>Demo Accounts</strong>
                        <div className="demo-account-list">
                            {demoAccounts.map((account) => (
                                <div className="demo-account-card" key={account.label}>
                                    <div className="demo-account-copy">
                                        <span>{account.label}</span>
                                        <code>{account.email}</code>
                                        <code>{account.password}</code>
                                    </div>
                                    <button
                                        className="secondary-button demo-prefill-button"
                                        onClick={() => onPrefillDemoAccount(account)}
                                        type="button"
                                    >
                                        Prefill
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
                <form onSubmit={onSubmit}>
                    <label>
                        Email
                        <input
                            autoComplete="email"
                            onChange={(event) => onEmailChange(event.target.value)}
                            placeholder="merchant_1@example.com"
                            type="email"
                            value={email}
                        />
                    </label>
                    <label>
                        Password
                        <input
                            autoComplete="current-password"
                            onChange={(event) => onPasswordChange(event.target.value)}
                            placeholder="••••••••"
                            type="password"
                            value={password}
                        />
                    </label>
                    <button className="primary-button" disabled={isAuthenticating} type="submit">
                        {isAuthenticating ? 'Signing In…' : 'Sign In'}
                    </button>
                </form>
                {authError ? <pre className="response error">{authError}</pre> : null}
            </section>
        </main>
    );
}
