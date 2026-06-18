import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowOnRender(): null {
    throw new Error('render failed');
}

describe('ErrorBoundary', () => {
    it('renders children when there is no error', () => {
        render(
            <ErrorBoundary>
                <p>Healthy UI</p>
            </ErrorBoundary>,
        );

        expect(screen.getByText('Healthy UI')).toBeInTheDocument();
    });

    it('shows a fallback panel when a child throws during render', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        render(
            <ErrorBoundary>
                <ThrowOnRender />
            </ErrorBoundary>,
        );

        expect(screen.getByRole('heading', { name: 'Something Went Wrong' })).toBeInTheDocument();
        expect(screen.getByText('render failed')).toBeInTheDocument();

        consoleError.mockRestore();
    });

    it('clears the error when Try Again is clicked', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let shouldThrow = true;

        const MaybeThrow = () => {
            if (shouldThrow) {
                throw new Error('temporary failure');
            }

            return <p>Recovered UI</p>;
        };

        render(
            <ErrorBoundary>
                <MaybeThrow />
            </ErrorBoundary>,
        );

        expect(screen.getByText('temporary failure')).toBeInTheDocument();

        shouldThrow = false;
        fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

        expect(screen.getByText('Recovered UI')).toBeInTheDocument();

        consoleError.mockRestore();
    });
});
