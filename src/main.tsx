// Load universal browser compatibility shims & polyfills first
import './utils/browserCompatibility';

import React, { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initVazirmatnFonts } from './utils/fontLoader';

// Initialize Persian fonts non-blocking
initVazirmatnFonts().catch(() => {});

interface RootBoundaryProps {
  children: ReactNode;
}

interface RootBoundaryState {
  hasError: boolean;
  error?: Error;
}

class RootErrorBoundary extends Component<RootBoundaryProps, RootBoundaryState> {
  constructor(props: RootBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): RootBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RootErrorBoundary] Caught fatal client error:', error, errorInfo);
  }

  handleReload = () => {
    try {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch {}
  };

  handleResetAndClear = () => {
    try {
      if (typeof window !== 'undefined') {
        try { window.localStorage.clear(); } catch {}
        try { window.sessionStorage.clear(); } catch {}
        window.location.href = window.location.pathname;
      }
    } catch {}
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans" dir="rtl">
          <div className="max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-3xl font-bold">
              ⚡
            </div>
            <h1 className="text-xl font-black text-white">سامانه انبارداری ام گاز</h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              سامانه برای سازگاری کامل با مرورگر شما آماده‌سازی شد. جهت اجرای صحیح بدون محدودیت، دکمه بارگذاری مجدد را لمس کنید.
            </p>
            {this.state.error && (
              <div className="text-xs font-mono text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-x-auto text-left" dir="ltr">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                بارگذاری مجدد سامانه
              </button>
              <button
                type="button"
                onClick={this.handleResetAndClear}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                اجرا در حالت سازگاری سریع
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>
  );
}
