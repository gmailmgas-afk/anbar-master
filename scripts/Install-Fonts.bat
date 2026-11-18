@echo off
chcp 65001 >nul
title نصب خودکار فونت های فارسی وزیرمتن (ام گاز)
echo ================================================================================
echo در حال نصب خودکار فونت‌های استاندارد فارسی وزیرمتن برای سامانه انبارداری ام گاز...
echo ================================================================================
echo.

set TARGET_USER_FONTS=%LOCALAPPDATA%\Microsoft\Windows\Fonts
if not exist "%TARGET_USER_FONTS%" mkdir "%TARGET_USER_FONTS%" >nul 2>&1

echo ۱. کپی فایل‌های فونت به پوشه فونت کاربر...
copy /Y "%~dp0*.ttf" "%TARGET_USER_FONTS%\" >nul 2>&1

echo ۲. ثبت فونت‌ها در رجیستری ویندوز...
reg add "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts" /v "Vazirmatn (TrueType)" /t REG_SZ /d "%TARGET_USER_FONTS%\Vazirmatn-Regular.ttf" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts" /v "Vazirmatn Bold (TrueType)" /t REG_SZ /d "%TARGET_USER_FONTS%\Vazirmatn-Bold.ttf" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts" /v "Vazirmatn ExtraBold (TrueType)" /t REG_SZ /d "%TARGET_USER_FONTS%\Vazirmatn-ExtraBold.ttf" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts" /v "Vazirmatn Light (TrueType)" /t REG_SZ /d "%TARGET_USER_FONTS%\Vazirmatn-Light.ttf" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts" /v "Vazirmatn Thin (TrueType)" /t REG_SZ /d "%TARGET_USER_FONTS%\Vazirmatn-Thin.ttf" /f >nul 2>&1

echo ۳. تلاش برای نصب سراسری سیستمی (در صورت دسترسی ادمین)...
copy /Y "%~dp0*.ttf" "%WINDIR%\Fonts\" >nul 2>&1

echo.
echo ================================================================================
echo فونت‌های فارسی با موفقیت بر روی سیستم شما نصب و فعال شدند!
echo ================================================================================
pause
