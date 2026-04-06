"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="panel-shell max-w-md rounded-[28px] p-6 text-center">
            <div className="text-2xl mb-3">⚠️</div>
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-2">组件加载出错</div>
            <div className="text-xs text-[var(--text-tertiary)] mb-4 font-mono">
              {this.state.error?.message?.slice(0, 120)}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="btn btn-secondary px-4 py-2 text-xs"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
