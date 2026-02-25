"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Bug } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. If omitted, a default error card is rendered. */
  fallback?: ReactNode;
  /** Label shown in the error card (e.g. "Dashboard", "Projetos"). */
  label?: string;
  /** Called when an error is caught. Useful for external logging. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console for dev visibility
    console.error("[ErrorBoundary]", error, errorInfo);
    this.props.onError?.(error, errorInfo);

    // Best-effort server log for diagnostics/support (non-blocking).
    if (typeof window !== "undefined") {
      const route = window.location.pathname + window.location.search;
      void fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[ErrorBoundary] ${this.props.label ?? "app"}`,
          description: error.message,
          route,
          severity: "high",
          use_ai: false,
          metadata: {
            source: "error_boundary",
            label: this.props.label ?? "unknown",
            stack: error.stack ?? null,
            component_stack: errorInfo.componentStack ?? null,
          },
        }),
      }).catch(() => {
        // Ignore logging failure; boundary should always render fallback.
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReportBug = () => {
    // Open the HQ Assistant bug report if available, or navigate to diagnostics
    const fab = document.querySelector<HTMLButtonElement>('[data-testid="hq-assistant-fab"]');
    if (fab) {
      fab.click();
      // Small delay to let the widget open, then click report bug
      setTimeout(() => {
        const reportBtn = document.querySelector<HTMLButtonElement>('[data-testid="hq-report-bug"]');
        reportBtn?.click();
      }, 300);
    } else {
      window.location.href = "/app/diagnostics";
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const label = this.props.label ?? "esta secção";
      const message = this.state.error?.message ?? "Erro desconhecido";

      return (
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-2xl border p-8 text-center"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            minHeight: 200,
          }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: "rgba(239,68,68,0.1)" }}
          >
            <AlertTriangle className="h-6 w-6" style={{ color: "var(--error)" }} />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Erro ao carregar {label}
            </p>
            <p className="text-xs font-mono max-w-md" style={{ color: "var(--text-3)" }}>
              {message.length > 200 ? `${message.slice(0, 200)}…` : message}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={this.handleRetry}
              className="btn btn-primary btn-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar novamente
            </button>
            <button
              onClick={this.handleReportBug}
              className="btn btn-secondary btn-sm"
            >
              <Bug className="h-3.5 w-3.5" />
              Reportar problema
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight wrapper for page-level error boundaries.
 * Wraps children with a labeled ErrorBoundary.
 */
export function PageErrorBoundary({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return <ErrorBoundary label={label}>{children}</ErrorBoundary>;
}
