import React, { useMemo, useState, useEffect } from 'react';
import { AppNotification, NotificationCategory, User } from '../types';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  X,
  Info,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
  Flame,
  FileText,
  Users,
  Boxes,
  ArrowLeft
} from 'lucide-react';
import { formatPersianDateTime, toPersianDigits } from '../utils/persian';

interface NotificationsCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  currentUser: User;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onNavigate?: (tab: string) => void;
}

type FilterKey = 'ALL' | 'INVENTORY_INSPECTION' | 'KARDEX' | 'INVOICE' | 'USER_SYSTEM';

export const NotificationsCenterModal: React.FC<NotificationsCenterModalProps> = ({
  isOpen,
  onClose,
  notifications,
  currentUser,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onNavigate
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const userId = currentUser?.user_id || '';

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !Array.isArray(n.read_by) || !n.read_by.includes(userId)).length;
  }, [notifications, userId]);

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'ALL') return notifications;
    if (activeFilter === 'INVENTORY_INSPECTION') {
      return notifications.filter(n => n.category === 'INVENTORY' || n.category === 'INSPECTION');
    }
    if (activeFilter === 'KARDEX') {
      return notifications.filter(n => n.category === 'KARDEX_REPAIR' || n.category === 'KARDEX_PRODUCTION');
    }
    if (activeFilter === 'INVOICE') {
      return notifications.filter(n => n.category === 'INVOICE');
    }
    return notifications.filter(n => n.category === 'USER' || n.category === 'SYSTEM');
  }, [notifications, activeFilter]);

  if (!isOpen) return null;

  const getCategoryIcon = (category: NotificationCategory) => {
    switch (category) {
      case 'INSPECTION':
        return <PackageCheck className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'KARDEX_REPAIR':
      case 'KARDEX_PRODUCTION':
        return <Flame className="w-4 h-4 text-orange-400 shrink-0" />;
      case 'INVOICE':
        return <FileText className="w-4 h-4 text-sky-400 shrink-0" />;
      case 'USER':
      case 'SYSTEM':
        return <Users className="w-4 h-4 text-purple-400 shrink-0" />;
      default:
        return <Boxes className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
  };

  const getLevelIcon = (level: AppNotification['level']) => {
    if (level === 'error' || level === 'warning') {
      return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
    }
    if (level === 'success') {
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    return <Info className="w-4 h-4 text-sky-400 shrink-0" />;
  };

  const getCategoryLabel = (category: NotificationCategory): string => {
    switch (category) {
      case 'INSPECTION':
        return 'بازرسی و شمارش';
      case 'KARDEX_REPAIR':
        return 'کاردکس تعمیر';
      case 'KARDEX_PRODUCTION':
        return 'کاردکس تولید';
      case 'INVOICE':
        return 'فاکتورها';
      case 'USER':
        return 'کاربران و امنیت';
      case 'SYSTEM':
        return 'سیستم';
      default:
        return 'انبار و حواله';
    }
  };

  const tabs: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'ALL', label: 'همه', count: notifications.length },
    {
      key: 'INVENTORY_INSPECTION',
      label: 'انبار و بازرسی',
      count: notifications.filter(n => n.category === 'INVENTORY' || n.category === 'INSPECTION').length
    },
    {
      key: 'KARDEX',
      label: 'کاردکس',
      count: notifications.filter(n => n.category === 'KARDEX_REPAIR' || n.category === 'KARDEX_PRODUCTION').length
    },
    {
      key: 'INVOICE',
      label: 'فاکتورها',
      count: notifications.filter(n => n.category === 'INVOICE').length
    },
    {
      key: 'USER_SYSTEM',
      label: 'کاربران و سیستم',
      count: notifications.filter(n => n.category === 'USER' || n.category === 'SYSTEM').length
    }
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>مرکز اعلان‌های همزمان سامانه</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-bold tabular-nums">
                    {toPersianDigits(unreadCount)} خوانده‌نشده
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                ثبت خودکار و بلادرنگ فعالیت تمام کاربران و دستگاه‌های متصل
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Tabs & Bulk Controls */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {tabs.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveFilter(t.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer border ${
                  activeFilter === t.key
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{t.label}</span>
                <span className="text-[10px] font-mono tabular-nums opacity-85">
                  ({toPersianDigits(t.count)})
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-700/60 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>خواندن همه</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="px-2.5 py-1.5 rounded-lg bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 border border-rose-700/50 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>پاک‌سازی لیست</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 bg-slate-950/40">
          {filteredNotifications.length === 0 ? (
            <div className="py-14 text-center space-y-2.5">
              <div className="w-12 h-12 mx-auto rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500">
                <BellOff className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-300">
                اعلانی در این بخش وجود ندارد
              </p>
              <p className="text-xs text-slate-500">
                به‌محض ثبت سند، حواله، بازرسی یا کاردکس توسط هر کاربر، اعلان آن بلافاصله اینجا نمایش داده می‌شود.
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const isRead = Array.isArray(notif.read_by) && notif.read_by.includes(userId);
              return (
                <div
                  key={notif.notification_id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isRead
                      ? 'bg-slate-900/70 border-slate-800 text-slate-300'
                      : 'bg-slate-900 border-amber-500/50 text-white shadow-md shadow-amber-950/20'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {!isRead && (
                        <span
                          className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                          title="خوانده نشده"
                        />
                      )}
                      {getCategoryIcon(notif.category)}
                      <span className="text-xs font-extrabold text-white">
                        {notif.title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                        {getCategoryLabel(notif.category)}
                      </span>
                      {notif.actor_name && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60 text-indigo-300 font-bold">
                          کاربر: {notif.actor_name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed">
                      {getLevelIcon(notif.level)}
                      <span>{notif.message}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                      <span>{formatPersianDateTime(notif.created_at)}</span>
                      {notif.device_id && <span>دستگاه: {notif.device_id}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {!isRead && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(notif.notification_id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        title="علامت‌گذاری به عنوان خوانده‌شده"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>خوانده شد</span>
                      </button>
                    )}
                    {notif.target_tab && onNavigate && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!isRead) onMarkRead(notif.notification_id);
                          onNavigate(notif.target_tab!);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>مشاهده</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
