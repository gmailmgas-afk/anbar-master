import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  X,
  ShieldAlert
} from 'lucide-react';
import {
  ToastItem,
  ConfirmRequest,
  subscribeToasts,
  subscribeConfirms
} from '../utils/uiFeedback';

export const UiFeedbackHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmQueue, setConfirmQueue] = useState<ConfirmRequest[]>([]);

  useEffect(() => {
    const unsubToast = subscribeToasts((item) => {
      setToasts((prev) => [...prev.slice(-3), item]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, item.durationMs);
    });

    const unsubConfirm = subscribeConfirms((req) => {
      setConfirmQueue((prev) => [...prev, req]);
    });

    return () => {
      unsubToast();
      unsubConfirm();
    };
  }, []);

  const activeConfirm = confirmQueue[0] || null;

  const resolveConfirm = (accepted: boolean) => {
    if (!activeConfirm) return;
    const target = activeConfirm;
    setConfirmQueue((prev) => prev.slice(1));
    target.resolve(accepted);
  };

  useEffect(() => {
    if (!activeConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeConfirm]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <>
      {/* Non-blocking stacked toast notifications */}
      {toasts.length > 0 && (
        <div
          className="fixed top-4 left-4 right-4 sm:left-4 sm:right-auto sm:w-full sm:max-w-md z-[10060] flex flex-col gap-2 pointer-events-none"
          dir="rtl"
        >
          {toasts.map((toast) => {
            const palette =
              toast.variant === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/70 text-emerald-100'
                : toast.variant === 'error'
                ? 'bg-rose-950/95 border-rose-500/70 text-rose-100'
                : toast.variant === 'warning'
                ? 'bg-amber-950/95 border-amber-500/70 text-amber-100'
                : 'bg-slate-900/95 border-indigo-500/70 text-slate-100';

            const IconComp =
              toast.variant === 'success'
                ? CheckCircle2
                : toast.variant === 'error'
                ? XCircle
                : toast.variant === 'warning'
                ? AlertTriangle
                : Info;

            const iconColor =
              toast.variant === 'success'
                ? 'text-emerald-400'
                : toast.variant === 'error'
                ? 'text-rose-400'
                : toast.variant === 'warning'
                ? 'text-amber-400'
                : 'text-indigo-400';

            return (
              <div
                key={toast.id}
                role="status"
                className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md flex items-start gap-3 text-xs leading-relaxed ${palette}`}
              >
                <IconComp className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
                <div className="flex-1 whitespace-pre-line font-medium">
                  {toast.message}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
                  aria-label="بستن اعلان"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-blocking Confirmation Modal */}
      {activeConfirm && (
        <div
          className="fixed inset-0 z-[10070] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => resolveConfirm(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-right"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                    activeConfirm.variant === 'info'
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                      : activeConfirm.variant === 'warning'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">
                  {activeConfirm.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 text-xs text-slate-200 leading-relaxed whitespace-pre-line">
              {activeConfirm.message}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer border border-slate-700"
              >
                {activeConfirm.cancelText}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-lg transition-colors cursor-pointer ${
                  activeConfirm.variant === 'info'
                    ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'
                    : activeConfirm.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                }`}
              >
                {activeConfirm.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
