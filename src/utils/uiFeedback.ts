export type FeedbackToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  variant: FeedbackToastVariant;
  durationMs: number;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export interface ConfirmRequest extends ConfirmOptions {
  id: string;
  resolve: (confirmed: boolean) => void;
}

type ToastListener = (toast: ToastItem) => void;
type ConfirmListener = (request: ConfirmRequest) => void;

const toastListeners = new Set<ToastListener>();
const confirmListeners = new Set<ConfirmListener>();

function inferVariant(message: string): FeedbackToastVariant {
  const m = String(message || '');
  if (
    m.includes('خطا') ||
    m.includes('نامعتبر') ||
    m.includes('اشتباه') ||
    m.includes('مجاز نمی‌باشد') ||
    m.includes('عدم دسترسی') ||
    m.includes('⛔')
  ) {
    return 'error';
  }
  if (
    m.includes('لطفاً') ||
    m.includes('انتخاب نمایید') ||
    m.includes('وارد نمایید') ||
    m.includes('نمی‌توانند') ||
    m.includes('⚠️') ||
    m.includes('هشدار')
  ) {
    return 'warning';
  }
  if (
    m.includes('موفقیت') ||
    m.includes('نهایی شد') ||
    m.includes('ثبت شد') ||
    m.includes('انجام شد')
  ) {
    return 'success';
  }
  return 'info';
}

export function showToast(
  message: string,
  variant?: FeedbackToastVariant,
  durationMs = 4800
): void {
  const item: ToastItem = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message: String(message || ''),
    variant: variant || inferVariant(message),
    durationMs
  };
  toastListeners.forEach((fn) => {
    try {
      fn(item);
    } catch {
      // ignore listener error
    }
  });
}

export function showConfirm(
  messageOrOptions: string | ConfirmOptions
): Promise<boolean> {
  const opts: ConfirmOptions =
    typeof messageOrOptions === 'string'
      ? { message: messageOrOptions }
      : messageOrOptions;

  if (confirmListeners.size === 0) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const req: ConfirmRequest = {
      id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: opts.title || 'تأیید عملیات',
      message: opts.message,
      confirmText: opts.confirmText || 'تأیید و ادامه',
      cancelText: opts.cancelText || 'انصراف',
      variant: opts.variant || 'danger',
      resolve
    };
    confirmListeners.forEach((fn) => {
      try {
        fn(req);
      } catch {
        resolve(false);
      }
    });
  });
}

export function subscribeToasts(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

export function subscribeConfirms(listener: ConfirmListener): () => void {
  confirmListeners.add(listener);
  return () => {
    confirmListeners.delete(listener);
  };
}
