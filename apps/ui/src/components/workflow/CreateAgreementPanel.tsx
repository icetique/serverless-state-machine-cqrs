import type { FormEvent } from 'react';
import type { FormState } from '../../types';

type CreateAgreementPanelProps = {
    form: FormState;
    idempotencyKey: string;
    isSubmitting: boolean;
    onAmountChange: (value: string) => void;
    onCreateAgreement: (event: FormEvent<HTMLFormElement>) => void;
    onPartnerIdChange: (value: string) => void;
};

export function CreateAgreementPanel({
    form,
    idempotencyKey,
    isSubmitting,
    onAmountChange,
    onCreateAgreement,
    onPartnerIdChange,
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
                    <input onChange={(event) => onPartnerIdChange(event.target.value)} value={form.partnerId} />
                </label>
                <label>
                    Amount
                    <input
                        inputMode="numeric"
                        min="1"
                        onChange={(event) => onAmountChange(event.target.value)}
                        value={form.amount}
                    />
                </label>
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
