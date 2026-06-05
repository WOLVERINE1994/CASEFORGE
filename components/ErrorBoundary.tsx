"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  title?: string;
  description?: string;
  resetKey?: string | number | null;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void error;
    void errorInfo;
    // Keep the fallback local and silent in production-safe UI boundaries.
  }

  override componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="rounded-[28px] border border-rose-300/40 bg-rose-50/90 px-5 py-5 text-rose-900 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
          Workspace Fallback
        </p>
        <h3 className="mt-2 text-lg font-semibold">
          {this.props.title ?? "This panel could not finish rendering."}
        </h3>
        <p className="mt-2 text-sm leading-6 opacity-90">
          {this.props.description ??
            "The rest of the app is still available. Refresh the page or reopen this module to try again."}
        </p>
      </section>
    );
  }
}
