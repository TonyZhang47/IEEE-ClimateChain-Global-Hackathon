"use client";

import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  label: string;
}

interface ErrorBoundaryState {
  message: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : "This panel failed." };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="rounded-2xl border border-coral/40 bg-coral/10 p-4 text-sm text-foam">
          <p>{this.props.label} stopped: {this.state.message}</p>
          <button type="button" className="btn-ghost mt-3" onClick={() => this.setState({ message: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
