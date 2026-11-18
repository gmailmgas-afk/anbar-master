import React, { useState, useEffect } from 'react';
import { User, RuntimeEnvironment } from '../types';
import { SEED_USERS } from '../database/seed-data';
import { LocalStorageManager } from '../database/storage';
import {
  verifyUserPasswordStrict,
  sanitizeInput,
  isSafeInput
} from '../utils/security';
import {
  Lock,
  UserCheck,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  Eye,
  EyeOff,
  User as UserIcon,
  CheckCircle2,
  Server,
  Globe,
  RefreshCw,
  Clock,
  Cpu,
  Fingerprint,
  ArrowRight,
  ShieldAlert,
  Sun,
  Moon
} from 'lucide-react';
import { toPersianDigits } from '../utils/persian';
import { getAuthCookie, saveAuthCookie } from '../utils/cookieAuth';

import { SyncEngine, getCentralServerUrl, getApiUrl } from '../sync-engine/sync-client';

interface LoginViewProps {
  onLoginSuccess: (user: User, password?: string) => void;
  currentActiveUser?: User | null;
  currentEnv?: RuntimeEnvironment;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  currentActiveUser,
  currentEnv: activeEnv = 'CLOUD_WEB',
  theme = 'dark',
  onToggleTheme
}: LoginViewProps) => {
  const currentEnv: RuntimeEnvironment = activeEnv;
  // Load current users from LocalStorageManager
  const [usersList, setUsersList] = useState<User[]>(() => {
    return LocalStorageManager.getUsers(currentEnv);
  });

  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [authStatusNotice, setAuthStatusNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Anti-Bot Honeypot Trap fields (نامرئی برای کاربر انسانی، تله فریبنده برای بات‌های مهاجم)
  const [honeypotField, setHoneypotField] = useState<string>('');
  const [honeypotAltField, setHoneypotAltField] = useState<string>('');
  const [formRenderTime] = useState<number>(() => Date.now());

  // Lock status
  const [lockStatus, setLockStatus] = useState<{ isLocked: boolean; remainingSeconds: number }>({
    isLocked: false,
    remainingSeconds: 0
  });

  // Strict Domain Banner details
  const [currentDomain, setCurrentDomain] = useState<string>('');
  const [isProductionDomain, setIsProductionDomain] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      setCurrentDomain(host);
      setIsProductionDomain(
        host === 'anbar.mgas.ir' ||
        host === 'localhost' ||
        host.includes('.run.app') ||
        host.includes('127.0.0.1')
      );
    }
  }, []);

  // Pre-fetch and synchronize all user identity records from Cloudflare D1 into local DB on mount
  useEffect(() => {
    let isMounted = true;
    SyncEngine.fetchAndSyncUsersFromCloud(currentEnv)
      .then(res => {
        if (isMounted && res.success) {
          setUsersList(LocalStorageManager.getUsers(currentEnv));
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [currentEnv]);

  // Refresh users list if modified in storage or received via sync
  useEffect(() => {
    const unsub = LocalStorageManager.subscribe(() => {
      setUsersList(LocalStorageManager.getUsers(currentEnv));
    });
    const handleUsersUpdated = () => {
      setUsersList(LocalStorageManager.getUsers(currentEnv));
    };
    window.addEventListener('mgas:users_updated', handleUsersUpdated);
    return () => {
      unsub();
      window.removeEventListener('mgas:users_updated', handleUsersUpdated);
    };
  }, [currentEnv]);

  // Check lock on target username
  useEffect(() => {
    const lockInfo = LocalStorageManager.checkAccountLock(currentEnv, usernameInput.trim().toLowerCase());
    setLockStatus(lockInfo);

    let timer: any = null;
    if (lockInfo.isLocked && lockInfo.remainingSeconds > 0) {
      timer = setInterval(() => {
        setLockStatus(prev => {
          if (prev.remainingSeconds <= 1) {
            clearInterval(timer);
            return { isLocked: false, remainingSeconds: 0 };
          }
          return { isLocked: true, remainingSeconds: prev.remainingSeconds - 1 };
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [usernameInput, currentEnv]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setAuthStatusNotice(null);

    // 0. HONEYPOT BOT TRAP INSPECTION (تله هانی‌پات ضد نفوذ بات‌های هکر)
    if (honeypotField.trim().length > 0 || honeypotAltField.trim().length > 0) {
      setIsSubmitting(true);
      LocalStorageManager.recordSecurityIncident(
        currentEnv,
        'HONEYPOT_BOT_TRIGGERED',
        'خنثی‌سازی بات یا اسکریپت مهاجم هکر توسط تله هانی‌پات در برگه ورود',
        {
          honeypotFieldLength: honeypotField.length,
          honeypotAltFieldLength: honeypotAltField.length
        }
      );
      // Artificial delay to exhaust bot computational resources
      await new Promise(r => setTimeout(r, 2200));
      setIsSubmitting(false);
      setErrorMessage('خطای امنیتی: فعالیت مشکوک بات شناسایی و درخواست ورود توسط تله هانی‌پات مسدود گردید.');
      return;
    }

    // Speed-based Honeypot: Impossible for human user to type and submit in under 350ms
    const elapsedSinceMount = Date.now() - formRenderTime;
    if (elapsedSinceMount < 350) {
      LocalStorageManager.recordSecurityIncident(
        currentEnv,
        'RAPID_BOT_SUBMISSION',
        'ارسال فوق‌سریع فرم ورود، مشکوک به بات‌های هکر خودکار',
        { elapsedMs: elapsedSinceMount }
      );
      setErrorMessage('خطای امنیتی: سرعت ارسال غیرعادی تشخیص داده شد (تله زمانی ضد بات).');
      return;
    }

    // 1. Strict Anti-Injection & XSS Inspection
    const userSafeCheck = isSafeInput(usernameInput);
    if (!userSafeCheck.isSafe) {
      setErrorMessage(userSafeCheck.reason || 'ورودی غیرمجاز شناسایی شد.');
      return;
    }
    const passSafeCheck = isSafeInput(passwordInput);
    if (!passSafeCheck.isSafe) {
      setErrorMessage(passSafeCheck.reason || 'ورودی غیرمجاز شناسایی شد.');
      return;
    }

    const trimmedUser = sanitizeInput(usernameInput, { maxLength: 50, allowMultiline: false }).toLowerCase();
    const trimmedPass = passwordInput.trim();

    // Check account lock
    const currentLock = LocalStorageManager.checkAccountLock(currentEnv, trimmedUser);
    if (currentLock.isLocked) {
      setErrorMessage(`حساب کاربری موقتاً به دلیل تلاش‌های ناموفق مکرر قفل است. لطفاً ${toPersianDigits(currentLock.remainingSeconds)} ثانیه صبر کنید.`);
      return;
    }

    if (!trimmedUser) {
      setErrorMessage('لطفاً نام کاربری را وارد کنید.');
      return;
    }

    if (!trimmedPass) {
      setErrorMessage('لطفاً کلمه عبور را وارد کنید.');
      return;
    }

    setIsSubmitting(true);
    setAuthStatusNotice('در حال بررسی مجوز ورود از پایگاه داده مرکزی...');

    let cloudUser: User | null = null;
    let cloudAuthSuccess = false;
    let serverRejectedResponse: { status: number; error?: string } | null = null;

    // STEP A: CLOUD / CENTRAL AUTHORIZATION REQUEST
    try {
      const centralUrl = getCentralServerUrl();
      let authRes: Response | null = null;

      try {
        authRes = await fetch(`${centralUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: trimmedUser,
            password: trimmedPass,
            device_id: typeof window !== 'undefined' ? window.location.hostname : 'CLIENT'
          }),
          signal: AbortSignal.timeout(3500)
        });
      } catch {}

      // Fallback to local server proxy if direct central was unreachable or had a 5xx server error
      const localAuthUrl = getApiUrl('/api/auth/login');
      if ((!authRes || authRes.status >= 500) && localAuthUrl !== `${centralUrl}/api/auth/login`) {
        try {
          authRes = await fetch(localAuthUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: trimmedUser,
              password: trimmedPass,
              device_id: typeof window !== 'undefined' ? window.location.hostname : 'CLIENT'
            }),
            signal: AbortSignal.timeout(3500)
          });
        } catch {}
      }

      if (authRes) {
        const authData = await authRes.json().catch(() => ({}));
        if (authRes.ok && authData.success && authData.user) {
          cloudUser = authData.user;
          cloudAuthSuccess = true;

          // ذخیره و به‌روزرسانی تمام کاربران در دیتابیس محلی کلاینت
          if (Array.isArray(authData.all_users) && authData.all_users.length > 0) {
            LocalStorageManager.syncUsersFromCloud(currentEnv, authData.all_users);
          } else {
            LocalStorageManager.saveOrUpdateUser(currentEnv, authData.user, authData.user, false);
          }
        } else if (authRes.status === 401 || authRes.status === 403 || authRes.status === 404) {
          serverRejectedResponse = { status: authRes.status, error: authData?.error };
        }
      }
    } catch (netErr) {
      console.warn('[LoginView] Central server authorization unreachable, fallback to local DB:', netErr);
    }

    // اگر مجوز ورود از سرور ابری/مرکزی تایید شد:
    if (cloudAuthSuccess && cloudUser) {
      LocalStorageManager.resetFailedLogin(currentEnv, cloudUser.username);
      saveAuthCookie(cloudUser.username, trimmedPass, cloudUser.password_hash);
      setIsSubmitting(false);
      setAuthStatusNotice(null);
      onLoginSuccess(cloudUser, trimmedPass);
      return;
    }

    // بررسی وجود تغییر کاربر همگام‌سازی‌نشده در صف آفلاین همین دستگاه
    const currentState = LocalStorageManager.getState(currentEnv);
    const hasPendingLocalUserChange = (currentState.sync_queue || []).some(q => {
      if (q.status !== 'PENDING' && q.status !== 'UPLOADING') return false;
      if (q.event?.entity_type !== 'USER') return false;
      const pUsername = String((q.event?.payload as any)?.username || '').toLowerCase();
      return pUsername === trimmedUser || String(q.event?.entity_id || '').toLowerCase() === trimmedUser;
    });

    // اگر سرور مرکزی/محلی به صورت قطعی درخواست را رد کرده و هیچ تغییر آفلاین همگام‌سازی‌نشده‌ای در صف نیست،
    // هرگز اجازه ورود از روی دیتابیس محلی قدیمی را نده و بلافاصله لیست کاربران را از سرور همگام کن
    if (serverRejectedResponse && !hasPendingLocalUserChange) {
      await SyncEngine.fetchAndSyncUsersFromCloud(currentEnv).catch(() => {});
      const result = LocalStorageManager.recordFailedLogin(currentEnv, trimmedUser);
      if (result.isLocked) {
        setErrorMessage('حساب کاربری موقتاً پس از ۵ بار تلاش ناموفق، به مدت ۱۵ دقیقه مسدود گردید.');
      } else {
        setErrorMessage(serverRejectedResponse.error || 'نام کاربری یا کلمه عبور وارد شده نامعتبر است.');
      }
      setIsSubmitting(false);
      setAuthStatusNotice(null);
      return;
    }

    // STEP B: LOCAL DATABASE AUTHENTICATION (فقط در حالت آفلاین یا وجود تغییر همگام‌سازی‌نشده در صف)
    setAuthStatusNotice('در حال اعتبارسنجی از پایگاه داده محلی...');

    try {
      const currentUsers = LocalStorageManager.getUsers(currentEnv);
      const normInput = trimmedUser
        .replace(/[\u200c\u200b\u200e\u200f\u061c]/g, '')
        .replace(/[ك]/g, 'ک')
        .replace(/[ي]/g, 'ی')
        .replace(/\s+/g, ' ')
        .trim();

      const matchedUser = currentUsers.find(u => {
        const uName = (u.username || '').toLowerCase();
        const uId = (u.user_id || '').toLowerCase();
        const fName = (u.full_name || '')
          .toLowerCase()
          .replace(/[\u200c\u200b\u200e\u200f\u061c]/g, '')
          .replace(/[ك]/g, 'ک')
          .replace(/[ي]/g, 'ی')
          .replace(/\s+/g, ' ')
          .trim();
        return (
          uName === trimmedUser ||
          uId === trimmedUser ||
          (normInput.length > 0 && fName.includes(normInput)) ||
          (u.username === 'amouei' && (normInput === 'عمویی' || normInput === 'admin' || normInput === 'مدیر عامل')) ||
          (u.username === 'karami' && (normInput === 'کرمی' || normInput === 'مدیر داخلی')) ||
          (u.username === 'hajivand' && (normInput === 'حاجی وند' || normInput === 'حاجی‌وند' || normInput === 'انباردار' || normInput === 'gholizadeh' || normInput === 'قلی زاده')) ||
          (u.username === 'safaei' && (normInput === 'صفایی' || normInput === 'خانم صفایی')) ||
          (u.username === 'hakimi' && (normInput === 'حکیمی' || normInput === 'خانم حکیمی')) ||
          (u.username === 'gholizadeh' && (normInput === 'حاجی وند' || normInput === 'hajivand' || normInput === 'قلی زاده' || normInput === 'انباردار'))
        );
      });

      if (!matchedUser) {
        const result = LocalStorageManager.recordFailedLogin(currentEnv, trimmedUser);
        if (result.isLocked) {
          setErrorMessage('حساب کاربری موقتاً پس از ۵ بار تلاش ناموفق، به مدت ۱۵ دقیقه مسدود گردید.');
        } else {
          setErrorMessage('نام کاربری یا کلمه عبور وارد شده نامعتبر است.');
        }
        setIsSubmitting(false);
        setAuthStatusNotice(null);
        return;
      }

      // اعتبارسنجی سخت‌گیرانه کلمه عبور در پایگاه داده محلی (بدون پسوردهای جایگزین قدیمی)
      const isValidLocal = await verifyUserPasswordStrict(trimmedPass, matchedUser);

      if (!isValidLocal) {
        const result = LocalStorageManager.recordFailedLogin(currentEnv, matchedUser.username);
        if (result.isLocked) {
          setErrorMessage('حساب کاربری موقتاً پس از ۵ بار تلاش ناموفق، به مدت ۱۵ دقیقه مسدود گردید.');
        } else {
          setErrorMessage('نام کاربری یا کلمه عبور وارد شده نامعتبر است.');
        }
        setIsSubmitting(false);
        setAuthStatusNotice(null);
        return;
      }

      // ورود آفلاین با موفقیت انجام شد: کلمه عبور محلی صحیح است
      LocalStorageManager.resetFailedLogin(currentEnv, matchedUser.username);
      saveAuthCookie(matchedUser.username, trimmedPass, matchedUser.password_hash);

      // تنها در صورتی که رویداد همگام‌سازی‌نشده‌ای در صف محلی باشد، آن را ارسال کن
      if ((currentState.sync_queue || []).some(q => q.status === 'PENDING' || q.status === 'UPLOADING')) {
        SyncEngine.syncNow(currentEnv).catch(() => {});
      }

      onLoginSuccess(matchedUser, trimmedPass);
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطای غیرمنتظره در احراز هویت');
    } finally {
      setIsSubmitting(false);
      setAuthStatusNotice(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-amber-500 selection:text-slate-950 font-sans relative">
      {/* Top Floating Theme Toggle */}
      {onToggleTheme && (
        <div className="absolute top-4 left-4 z-20">
          <button
            type="button"
            onClick={onToggleTheme}
            className={`p-2 rounded-xl transition-all border flex items-center gap-1.5 cursor-pointer shadow-lg ${
              theme === 'light'
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                : 'bg-slate-900/90 hover:bg-slate-800 text-amber-400 border-slate-800'
            }`}
            title={theme === 'light' ? 'تغییر به تم تاریک' : 'تغییر به تم روشن'}
          >
            {theme === 'light' ? <Moon className="w-4 h-4 text-indigo-700" /> : <Sun className="w-4 h-4 text-amber-400" />}
            <span className="text-xs font-bold">{theme === 'light' ? 'تم شب' : 'تم روز'}</span>
          </button>
        </div>
      )}

      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg z-10 space-y-5">
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl shadow-black/40 mb-1">
            <img
              src="/new-logo-mgas-2(1)_fixed.svg"
              alt="لوگوی ام گاز"
              className="h-12 sm:h-14 w-auto object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src !== window.location.origin + '/logo.svg') {
                  target.src = '/logo.svg';
                }
              }}
            />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              سامانه مدیریت انبارداری ام گاز
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              سیستم انبارداری و کاردکس تخصصی سیلندر گاز مایع • احراز هویت الزامی
            </p>
          </div>

          {/* Strict Security Domain Lock Banner */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[11px] text-emerald-300 font-mono">
              <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>دامنه مجاز انحصاری:</span>
              <strong className="text-white">https://anbar.mgas.ir</strong>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-amber-500/40 text-[11px] text-amber-300">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>احراز هویت رمزنگاری‌شده و امن</span>
            </div>
          </div>
        </div>

        {/* Login Box */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl backdrop-blur-xl space-y-5">
          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Anti-Bot Honeypot Trap (کاملاً نامرئی برای کاربر انسانی، تله فریبنده برای خزنده‌ها و بات‌های هکر) */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-9999px',
                top: '-9999px',
                opacity: 0,
                width: '1px',
                height: '1px',
                overflow: 'hidden',
                pointerEvents: 'none'
              }}
              tabIndex={-1}
            >
              <label htmlFor="company_website_url">نشانی وب‌سایت سازمانی (تله هانی‌پات)</label>
              <input
                id="company_website_url"
                type="text"
                name="company_website_url"
                value={honeypotField}
                onChange={e => setHoneypotField(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
              <label htmlFor="user_system_nickname">نام مستعار سیستمی</label>
              <input
                id="user_system_nickname"
                type="text"
                name="user_system_nickname"
                value={honeypotAltField}
                onChange={e => setHoneypotAltField(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {/* Username Input */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-300">
                نام کاربری
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  dir="auto"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="نام کاربری را وارد کنید"
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono transition-all"
                />
                <UserIcon className="w-4 h-4 text-slate-500 absolute right-3 pointer-events-none" />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-300">
                  کلمه عبور
                </label>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="کلمه عبور را وارد کنید"
                  disabled={lockStatus.isLocked}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-10 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono transition-all disabled:opacity-50 text-left"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute left-3 text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
                  title={showPassword ? 'مخفی کردن کلمه عبور' : 'نمایش کلمه عبور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Lock Status Alert */}
            {lockStatus.isLocked && (
              <div className="p-3.5 rounded-xl bg-amber-950/80 border border-amber-600 text-amber-200 text-xs flex items-center gap-2.5 shadow-md">
                <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="leading-relaxed">
                  حساب کاربری به دلیل تلاش‌های ناموفق مکرر قفل امنیتی شده است. زمان انتظار باقی‌مانده:{' '}
                  <strong className="font-mono text-white text-sm">{toPersianDigits(lockStatus.remainingSeconds)} ثانیه</strong>
                </div>
              </div>
            )}

            {/* Error message */}
            {errorMessage && !lockStatus.isLocked && (
              <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-700 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || lockStatus.isLocked}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-200 disabled:text-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              <span>ورود امن به سامانه انبارداری ام گاز</span>
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-[11px] text-slate-500 space-y-0.5">
          <div>سامانه انبارداری ام گاز • پایگاه داده‌های محلی و ابری مقاوم در برابر نفوذ و حذف</div>
          <div className="text-[10px] text-slate-600">Strict Lock: https://anbar.mgas.ir | سامانه امنیتی ام گاز</div>
        </div>
      </div>
    </div>
  );
};
