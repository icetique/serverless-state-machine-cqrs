import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
    children: ReactNode;
};

type ErrorBoundaryState = {
    error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('UI render error', error, errorInfo.componentStack);
    }

    private handleRetry = (): void => {
        this.setState({ error: null });
    };

    render(): ReactNode {
        if (this.state.error) {
            return (
                <main className="shell">
                    <section className="panel form-panel">
                        <div className="panel-header">
                            <h2>Something Went Wrong</h2>
                            <span className="badge muted">Error</span>
                        </div>
                        <p className="lede">The UI hit an unexpected error. You can reload the page or try again.</p>
                        <pre className="response error">{this.state.error.message}</pre>
                        <button className="primary-button" onClick={this.handleRetry} type="button">
                            Try Again
                        </button>
                    </section>
                </main>
            );
        }

        return this.props.children;
    }
}
