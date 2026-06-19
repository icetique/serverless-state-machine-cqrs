import type { FormEvent } from 'react';
import type { FormState } from '../../types';

type CreateAgreementPanelProps = {
    form: FormState;
    idempotencyKey: string;
    isSubmitting: boolean;
    onAmountChange: (value: string) => void;
    onCreateAgreement: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateAgreementPanel({
    form,
    idempotencyKey,
    isSubmitting,
    onAmountChange,
    onCreateAgreement,
}: CreateAgreementPanelProps) {
    return (
        <section className="panel form-panel">
            <div className="panel-header">
                <h2>Create Agreement</h2>
                <span className="badge">Merchant Only</span>
            </div>
            <form onSubmit={onCreateAgreement}>
                <label>
                    Merchant ID
                    <input readOnly value={form.merchantId} />
                </label>
                <p className="helper-text locked-input-note">
                    Locked from JWT claim <code>merchant_id</code>.
                </p>
                <label>
                    Partner ID
                    <input readOnly value={form.partnerId} />
                </label>
                <p className="helper-text locked-input-note">
                    Demo partner fixed to <code>partner_2</code> (must match the partner JWT <code>partner_id</code>{' '}
                    claim).
                </p>
                <label>
                    Amount (minor units, e.g. cents)
                    <input
                        inputMode="numeric"
                        min="1"
                        step="1"
                        onChange={(event) => onAmountChange(event.target.value)}
                        value={form.amount}
                    />
                </label>
                <p className="helper-text">Example: 1000 = $10.00 USD. Whole integers only — no decimals.</p>
                <button className="primary-button" disabled={isSubmitting} type="submit">
                    {isSubmitting ? 'Creating…' : 'Create Agreement'}
                </button>
                <p className="helper-text">
                    Current idempotency key:
                    <br />
                    <code>{idempotencyKey}</code>
                </p>
            </form>
        </section>
    );
}
