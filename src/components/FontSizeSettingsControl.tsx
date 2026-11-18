import React, { useState, useEffect } from 'react';
import { Type, RotateCcw, Check, Sparkles, SlidersHorizontal, Cookie, ChevronUp, ChevronDown } from 'lucide-react';
import { User } from '../types';
import { toPersianDigits } from '../utils/persian';
import {
  FontSizePreferences,
  DEFAULT_FONT_PREFERENCES,
  FONT_PRESETS,
  getUserFontSizeFromCookie,
  saveUserFontSizeToCookie
} from '../utils/fontSizeCookie';

interface FontSizeSettingsControlProps {
  currentUser?: User | null;
  className?: string;
  isCompact?: boolean;
  defaultExpanded?: boolean;
}

export const FontSizeSettingsControl: React.FC<FontSizeSettingsControlProps> = ({
  currentUser,
  className = '',
  isCompact = false,
  defaultExpanded = true
}) => {
  const userKey = currentUser?.username || currentUser?.user_id || 'default';
  const [preferences, setPreferences] = useState<FontSizePreferences>(() =>
    getUserFontSizeFromCookie(userKey)
  );
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Sync when user changes
  useEffect(() => {
    const loaded = getUserFontSizeFromCookie(userKey);
    setPreferences(loaded);
  }, [userKey]);

  // Listen to external change events if any
  useEffect(() => {
    const handleFontChange = (e: Event) => {
      const customEvent = e as CustomEvent<FontSizePreferences>;
      if (customEvent.detail) {
        setPreferences(customEvent.detail);
      }
    };
    window.addEventListener('mgas:font_size_changed', handleFontChange);
    return () => window.removeEventListener('mgas:font_size_changed', handleFontChange);
  }, []);

  const triggerSave = (newPrefs: FontSizePreferences) => {
    setPreferences(newPrefs);
    saveUserFontSizeToCookie(newPrefs, userKey);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  const handleHeadingScale = (scale: number) => {
    const clamped = Math.min(1.60, Math.max(0.70, Number(scale.toFixed(2))));
    triggerSave({
      ...preferences,
      headingScale: clamped
    });
  };

  const handleParagraphScale = (scale: number) => {
    const clamped = Math.min(1.60, Math.max(0.70, Number(scale.toFixed(2))));
    triggerSave({
      ...preferences,
      paragraphScale: clamped
    });
  };

  const handleReset = () => {
    triggerSave({ ...DEFAULT_FONT_PREFERENCES });
  };

  const handleBothChange = (delta: number) => {
    const nextH = Math.min(1.60, Math.max(0.70, Number((preferences.headingScale + delta).toFixed(2))));
    const nextP = Math.min(1.60, Math.max(0.70, Number((preferences.paragraphScale + delta).toFixed(2))));
    triggerSave({
      headingScale: nextH,
      paragraphScale: nextP
    });
  };

  const headingPct = Math.round(preferences.headingScale * 100);
  const paragraphPct = Math.round(preferences.paragraphScale * 100);

  return (
    <div
      className={`rounded-xl border border-indigo-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-2.5 text-slate-200 shadow-md ${className}`}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-600/25 border border-indigo-500/40 flex items-center justify-center shrink-0">
            <Type className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
              <span>تنظیمات سایز فونت اختصاصی</span>
              {showSavedToast && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                  ذخیره شد
                </span>
              )}
            </div>
            <div className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Cookie className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span>ذخیره در کوکی مرورگر ({currentUser?.full_name ? currentUser.full_name : 'کاربر جاری'})</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title={isExpanded ? 'بستن پنل فونت' : 'باز کردن تنظیمات فونت'}
        >
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-3 pt-2.5 text-xs">
          {/* Quick Dual Stepper & Factory Reset */}
          <div className="flex items-center justify-between gap-1.5 bg-slate-950/70 p-1.5 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-300 font-medium shrink-0">تغییر همزمان:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleBothChange(-0.10)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold cursor-pointer transition-colors active:scale-95"
                title="کوچک‌تر کردن همزمان هدینگ‌ها و پاراگراف‌ها"
              >
                A-
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-2 py-0.5 rounded bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
                title="بازنشانی هر دو به اندازه استاندارد ۱۰۰٪"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>۱۰۰٪</span>
              </button>
              <button
                type="button"
                onClick={() => handleBothChange(0.10)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold cursor-pointer transition-colors active:scale-95"
                title="بزرگ‌تر کردن همزمان هدینگ‌ها و پاراگراف‌ها"
              >
                A+
              </button>
            </div>
          </div>

          {/* 1. Headings (H1 - H6) Control */}
          <div className="space-y-1.5 bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                <span>سایز هدینگ‌ها و عناوین (H1 تا H6):</span>
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                {toPersianDigits(headingPct)}%
              </span>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-4 gap-1">
              {FONT_PRESETS.map((preset) => {
                const isActive = Math.abs(preferences.headingScale - preset.scale) < 0.05;
                return (
                  <button
                    key={preset.scale}
                    type="button"
                    onClick={() => handleHeadingScale(preset.scale)}
                    className={`py-1 px-1 rounded text-[10px] font-medium text-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs font-bold ring-1 ring-indigo-400'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Fine tuning steppers */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] text-slate-400">تنظیم دقیق:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleHeadingScale(preferences.headingScale - 0.05)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono cursor-pointer border border-slate-700"
                  title="کاهش ۵٪ اندازه هدینگ‌ها"
                >
                  -۵٪
                </button>
                <button
                  type="button"
                  onClick={() => handleHeadingScale(preferences.headingScale + 0.05)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono cursor-pointer border border-slate-700"
                  title="افزایش ۵٪ اندازه هدینگ‌ها"
                >
                  +۵٪
                </button>
              </div>
            </div>
          </div>

          {/* 2. Paragraphs (P) Control */}
          <div className="space-y-1.5 bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                <span>سایز متن و پاراگراف‌ها (P):</span>
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60">
                {toPersianDigits(paragraphPct)}%
              </span>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-4 gap-1">
              {FONT_PRESETS.map((preset) => {
                const isActive = Math.abs(preferences.paragraphScale - preset.scale) < 0.05;
                return (
                  <button
                    key={preset.scale}
                    type="button"
                    onClick={() => handleParagraphScale(preset.scale)}
                    className={`py-1 px-1 rounded text-[10px] font-medium text-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-cyan-600 text-white shadow-xs font-bold ring-1 ring-cyan-400'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Fine tuning steppers */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] text-slate-400">تنظیم دقیق:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleParagraphScale(preferences.paragraphScale - 0.05)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono cursor-pointer border border-slate-700"
                  title="کاهش ۵٪ اندازه پاراگراف‌ها"
                >
                  -۵٪
                </button>
                <button
                  type="button"
                  onClick={() => handleParagraphScale(preferences.paragraphScale + 0.05)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono cursor-pointer border border-slate-700"
                  title="افزایش ۵٪ اندازه پاراگراف‌ها"
                >
                  +۵٪
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-2 rounded-lg bg-black/40 border border-slate-800 text-right space-y-1 overflow-hidden">
            <div className="text-[9px] text-amber-300 font-semibold mb-1 flex items-center justify-between">
              <span>پیش‌نمایش زنده در همین لحظه:</span>
              <span className="text-[8px] text-slate-400 font-mono">Real-time preview</span>
            </div>
            <div className="border-r-2 border-indigo-500 pr-2 space-y-1">
              {/* Scaled Heading Sample */}
              <h4
                style={{
                  fontSize: `${1.125 * preferences.headingScale}rem`,
                  lineHeight: 1.35
                }}
                className="font-bold text-white transition-all duration-150"
              >
                تیتر نمونه: مدیریت موجودی ام‌گاز
              </h4>
              {/* Scaled Paragraph Sample */}
              <p
                style={{
                  fontSize: `${0.95 * preferences.paragraphScale}rem`,
                  lineHeight: 1.55
                }}
                className="text-slate-300 transition-all duration-150"
              >
                متن توضیحی پاراگراف با اندازه قلم انتخابی کاربر. این تغییرات برای تمامی بخش‌ها و برگه‌ها اعمال می‌شود.
              </p>
            </div>
          </div>

          {/* Persistence Note */}
          <div className="flex items-center justify-between text-[9px] text-slate-400 pt-0.5">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>پایدار در کوکی مرورگر کاربر</span>
            </span>
            <span className="font-mono text-slate-500">v-cookie: 365d</span>
          </div>
        </div>
      )}
    </div>
  );
};
