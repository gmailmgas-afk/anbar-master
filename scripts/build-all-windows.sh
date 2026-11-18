#!/bin/bash
set -e

echo "================================================================="
echo "M-Gas Inventory: Clean Rebuild of Office (64-bit) & Warehouse (32-bit)"
echo "================================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 1. Completely remove ALL previous Windows builds and stale downloads
echo ">> [1/6] حذف کامل تمام نسخه‌های قبلی ویندوز و فایل‌های زائد..."
rm -rf release-dist
rm -rf public/downloads/*.exe public/downloads/*.zip public/downloads/*.bat public/downloads/*.txt
rm -rf dist/downloads/*.exe dist/downloads/*.zip dist/downloads/*.bat dist/downloads/*.txt 2>/dev/null || true
mkdir -p release-dist
mkdir -p public/downloads

# 2. Build latest Web Application Dist (with full CSS, local fonts & assets)
echo ">> [2/6] ساخت بیلد نهایی وب و استایل‌های CSS و فونت‌های محلی (npm run build)..."
npm run build

# 3. Copy local SQLite databases needed by installers
echo ">> [3/6] آماده‌سازی پایگاه‌های داده محلی (db-anbar1, db-anbar2, db-anbar3)..."
cp public/db-anbar*.db release-dist/
cp public/db-anbar*.db public/downloads/
cp public/db-anbar1 public/downloads/db-anbar1 2>/dev/null || cp public/db-anbar1.db public/downloads/db-anbar1
cp public/db-anbar2 public/downloads/db-anbar2 2>/dev/null || cp public/db-anbar2.db public/downloads/db-anbar2
cp public/db-anbar3 public/downloads/db-anbar3 2>/dev/null || cp public/db-anbar3.db public/downloads/db-anbar3

# 4. Compile 64-bit & 32-bit Native Win32 Relay Servers
echo ">> [4/6] کامپایل هسته سرور ۶۴ بیتی و ۳۲ بیتی ویندوز (MinGW-w64)..."
x86_64-w64-mingw32-gcc -O2 -Wall -mwindows scripts/mgas-server.c -o release-dist/MGasServer64.exe -lws2_32 -lwininet -lshell32 -lole32
i686-w64-mingw32-gcc -O2 -Wall -mwindows scripts/mgas-server.c -o release-dist/MGasServer32.exe -lws2_32 -lwininet -lshell32 -lole32

# 5. Build ONLY the two requested NSIS Setup Installers
echo ">> [5/6] ساخت نصاب‌های ۶۴ بیتی آفیس و ۳۲ بیتی انبار (NSIS)..."
makensis scripts/build-office-installer.nsi
makensis scripts/build-warehouse-installer.nsi

# 6. Deploy ONLY those two installers to public/downloads/
echo ">> [6/6] استقرار نصاب‌های نهایی در public/downloads/..."
cp release-dist/Office-Windows11-Setup.exe public/downloads/Office-Windows11-Setup.exe
cp release-dist/Warehouse-Windows7-Setup.exe public/downloads/Warehouse-Windows7-Setup.exe

echo "================================================================="
echo "بازسازی کامل با موفقیت انجام شد. فایل‌های خروجی:"
ls -lh release-dist/*.exe public/downloads/
echo "================================================================="
