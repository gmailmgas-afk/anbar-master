import React, { useState, useEffect } from 'react';
import { triggerFileDownload } from '../utils/file-download';
import {
  CheckCircle2,
  AlertTriangle,
  FolderCog,
  Terminal,
  Download,
  HardDriveDownload,
  Copy,
  Check,
  X,
  ExternalLink,
  ShieldAlert,
  Cpu,
  Type
} from 'lucide-react';

interface Windows11TroubleshootingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Windows11TroubleshootingModal: React.FC<Windows11TroubleshootingModalProps> = ({
  isOpen,
  onClose
}) => {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Global Escape key listener to close modal (always registered before conditional return)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 2500);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                <span>راهنمای نصب و اجرای تمیز نسخه آفیس ویندوز ۱۰ و ۱۱</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-700 text-blue-300 font-mono">
                  Windows 11 / 10 x64
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                نصب خودکار در مسیر کاربر بدون نیاز به دسترسی ادمین، همگام‌سازی زنده کلودفلر و فونت فارسی داخلی
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
          {/* Official Installer Download Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-blue-950/70 border border-emerald-500/50 shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-emerald-300 font-bold flex items-center gap-2 text-sm">
                  <HardDriveDownload className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>نصاب رسمی ۶۴ بیتی دفتر مرکزی (ویندوز ۱۰ و ۱۱)</span>
                </div>
                <p className="text-[11px] text-slate-200">
                  پس از نصب، دقیقاً یک میانبر <strong className="text-amber-300">«انبارداری ام گاز»</strong> و یک میانبر <strong className="text-cyan-300">«نسخه وب انبارداری ام گاز»</strong> (متصل به <span className="font-mono">https://anbar.mgas.ir</span>) روی دسکتاپ ایجاد می‌شود و هیچ پنجره لاگی روی صفحه نمایش داده نمی‌شود.
                </p>
              </div>

              <a
                href="/downloads/Office-Windows11-Setup.exe"
                download="Office-Windows11-Setup.exe"
                onClick={(e) => triggerFileDownload('/downloads/Office-Windows11-Setup.exe', 'Office-Windows11-Setup.exe', e)}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md transition whitespace-nowrap cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4 text-slate-950" />
                <span>دانلود نصاب ۶۴ بیتی (.exe)</span>
              </a>
            </div>
          </div>

          {/* Local Persian Fonts Guarantee Banner */}
          <div className="p-4 rounded-xl bg-blue-950/35 border border-blue-800/60 space-y-2">
            <div className="text-blue-300 font-bold flex items-center gap-2 text-sm">
              <Type className="w-4 h-4 text-blue-400" />
              <span>فونت فارسی محلی (Vazirmatn) بدون خطای نصب</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-normal">
              کلیه اوزان فونت وزیرمتن به‌صورت محلی درون استایل‌های CSS برنامه تعبیه شده‌اند و همزمان هنگام نصب به‌صورت خاموش در پوشه فونت‌های کاربر (<span className="font-mono text-cyan-300">%LOCALAPPDATA%\Microsoft\Windows\Fonts</span>) ثبت می‌گردند؛ بنابراین هرگز خطای دسترسی نصب فونت ویندوز رخ نمی‌دهد.
            </p>
          </div>

          {/* Main Troubleshooting Tips */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>نکات رفع خطاهای احتمالی هنگام نصب یا اجرا در ویندوز ۱۱</span>
            </h4>

            {/* Item 1: SmartScreen */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-amber-400 flex items-center gap-1.5 text-xs">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>۱. پیام محافظتی Windows Defender SmartScreen</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300">
                  رایج‌ترین مورد
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/80 text-[11px] text-slate-300 space-y-1 border border-slate-800">
                <div>در صورت نمایش صفحه آبی "Windows protected your PC"، روی گزینه <b>More info</b> کلیک کرده و سپس دکمه <b>Run anyway</b> را بزنید.</div>
              </div>
            </div>

            {/* Item 2: Live Stream & Port 3000 */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>۲. همگام‌سازی لحظه‌ای (Live Stream) و دیتابیس مرکزی</span>
              </span>
              <p className="text-[11px] text-slate-300">
                سرویس داخلی ویندوز به‌صورت خودکار به <span className="font-mono text-cyan-300">https://anbar.mgas.ir</span> متصل شده و رویدادهای جدید را در لحظه دریافت می‌کند و در صورت قطع موقت اینترنت، به‌سرعت از کش محلی استفاده می‌نماید.
              </p>
            </div>

            {/* Item 3: Edge / Chrome runtime */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-purple-400 flex items-center gap-1.5 text-xs">
                  <FolderCog className="w-3.5 h-3.5" />
                  <span>۳. موتور اجرای مرورگر استاندارد (Edge / Chrome)</span>
                </span>
                <a
                  href="https://www.google.com/chrome/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-purple-300 hover:text-purple-200 flex items-center gap-1 hover:underline"
                >
                  <span>دریافت Google Chrome</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-[11px] text-slate-300">
                برنامه به‌صورت خودکار از Microsoft Edge یا Google Chrome با رابط واکنش‌گرا و پشتیبانی کامل پرینت اسناد استفاده می‌کند.
              </p>
            </div>
          </div>

          {/* Useful PowerShell Permission Command */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span>مسیر نصب استاندارد کاربر (بدون نیاز به دسترسی ادمین):</span>
            </div>

            <div className="flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-slate-800 text-[11px] font-mono">
              <span className="text-slate-300 select-all overflow-x-auto dir-ltr text-left">
                %LOCALAPPDATA%\Programs\MGasInventory
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard('%LOCALAPPDATA%\\Programs\\MGasInventory', 'install-dir')}
                className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer ml-2"
                title="کپی مسیر نصب"
              >
                {copiedItem === 'install-dir' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/70">
          <a
            href="/troubleshooting_win11.txt"
            download="M-Gas-Troubleshooting-Win11.txt"
            onClick={(e) => triggerFileDownload('/troubleshooting_win11.txt', 'M-Gas-Troubleshooting-Win11.txt', e)}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 hover:underline font-bold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>دانلود راهنمای متنی (.txt)</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition cursor-pointer"
          >
            متوجه شدم
          </button>
        </div>
      </div>
    </div>
  );
};
