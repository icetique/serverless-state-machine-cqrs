/** Whole currency amount in minor units (e.g. USD cents). */
export type MoneyMinor = number;

export class InvalidMoneyAmountError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidMoneyAmountError';
    }
}

export const parseMoneyMinorUnits = (amount: unknown): MoneyMinor => {
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
        throw new InvalidMoneyAmountError('amount must be a positive integer in minor currency units (e.g. cents)');
    }

    return amount;
};

export const formatMoneyMinorUnits = (amount: MoneyMinor, currency = 'USD'): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
