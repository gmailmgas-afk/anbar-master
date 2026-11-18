import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI component:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-4 bg-slate-900 border border-rose-500/40 rounded-2xl text-center space-y-4 max-w-xl mx-auto shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-700/60 flex items-center justify-center mx-auto text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {this.props.fallbackTitle || 'بروز خطای غیرمنتظره در بارگذاری این بخش'}
            </h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-sans">
              سیستم برای جلوگیری از توقف برنامه از این بخش محافظت نمود. داده‌های اصلی ذخیره شده در پایگاه داده کاملاً امن هستند.
            </p>
            {this.state.error && (
              <div className="mt-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-rose-300 text-left overflow-x-auto" dir="ltr">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>بارگذاری مجدد این بخش</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
