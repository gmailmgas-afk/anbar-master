; ==============================================================================
; NSIS INSTALLER: انبارداری ام گاز (نسخه انبار مرکزی ویندوز ۷ / ۱۰ / ۱۱ - ۳۲ بیتی)
; مهندس آرش کاویانی پور
; ==============================================================================

Unicode true
SetCompressor /SOLID lzma

!define APP_NAME "انبارداری ام گاز"
!define WEB_SHORTCUT_NAME "نسخه وب انبارداری ام گاز"
!define APP_VERSION "2.0.0"
!define APP_PUBLISHER "ام گاز - ساخته شده توسط مهندس آرش کاویانی پور"
!define APP_URL "http://localhost:3000/"
!define WEB_CLOUD_URL "https://anbar.mgas.ir"
!define APP_EXE "MGasInventory.exe"
!define PROJECT_DIR ".."

Name "${APP_NAME}"
OutFile "${PROJECT_DIR}/release-dist/Warehouse-Windows7-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\MGasInventory"
InstallDirRegKey HKCU "Software\MGasInventory" "InstallDir"
RequestExecutionLevel user

; Modern UI 2
!include "MUI2.nsh"

; Interface Settings
!define MUI_ABORTWARNING
!define MUI_ICON "${PROJECT_DIR}/public/logo.ico"
!define MUI_UNICON "${PROJECT_DIR}/public/logo.ico"

; Pages (NO README/Log screen or checkbox on Finish page)
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "اجرای سامانه انبارداری ام گاز"
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "Farsi"
!insertmacro MUI_LANGUAGE "English"

; Auto close running instances on installer startup
Function .onInit
  ExecWait 'cmd.exe /C taskkill /F /IM "MGasInventory.exe" /T'
  ExecWait 'cmd.exe /C taskkill /F /IM "MGasServer64.exe" /T'
  ExecWait 'cmd.exe /C taskkill /F /IM "MGasServer32.exe" /T'
  ExecWait 'cmd.exe /C taskkill /F /IM "MGasServer.exe" /T'
FunctionEnd

; Version Information
VIProductVersion "2.0.0.0"
VIAddVersionKey /LANG=1065 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=1065 "Comments" "سامانه مدیریت جامع انبارداری ام گاز - نسخه انبار مرکزی ویندوز ۷ و سیستم‌های ۳۲ بیتی"
VIAddVersionKey /LANG=1065 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=1065 "LegalCopyright" "تمامی حقوق متعلق به شرکت ام گاز می‌باشد"
VIAddVersionKey /LANG=1065 "FileDescription" "نصاب رسمی ۳۲ بیتی سامانه انبارداری ام گاز"
VIAddVersionKey /LANG=1065 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1065 "ProductVersion" "${APP_VERSION}"

; Installer Section
Section "اصلی" SecCore
  SetOutPath "$INSTDIR"

  ; Terminate running processes to release file locks
  ExecWait 'cmd.exe /C taskkill /F /IM "${APP_EXE}" /T'
  ExecWait 'cmd.exe /C taskkill /F /IM "MGasServer64.exe" /T'
  ExecWait 'cmd.exe /C taskkill /F /IM "MGasServer32.exe" /T'
  ExecWait 'cmd.exe /C taskkill /F /IM "MGasServer.exe" /T'
  Sleep 800

  ; Safe replacement if locked
  Delete "$INSTDIR\${APP_EXE}"
  ClearErrors
  IfFileExists "$INSTDIR\${APP_EXE}" 0 +3
    Rename "$INSTDIR\${APP_EXE}" "$INSTDIR\${APP_EXE}.old"
    Delete /REBOOTOK "$INSTDIR\${APP_EXE}.old"

  ; Remove legacy artifacts and logs from install dir & desktop cleanly
  RMDir /r "$INSTDIR\app\assets"
  Delete "$INSTDIR\app\index.html"
  Delete "$INSTDIR\app\server.mjs"
  Delete "$INSTDIR\MGas_Execution_Log.txt"
  Delete "$INSTDIR\MGasInventory.bat"
  Delete "$DESKTOP\مشاهده لاگ انبارداری ام گاز.lnk"
  Delete "$DESKTOP\سرور ابری anbar.mgas.ir.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\مشاهده لاگ اجرای برنامه.lnk"

  ; Write Universal 32-bit Native Win32 Server / Launcher
  File /oname=${APP_EXE} "${PROJECT_DIR}/release-dist/MGasServer32.exe"
  File "${PROJECT_DIR}/public/logo.ico"

  ; Write SQLite databases for 3 warehouses
  File /oname=db-anbar1.db "${PROJECT_DIR}/release-dist/db-anbar1.db"
  File /oname=db-anbar2.db "${PROJECT_DIR}/release-dist/db-anbar2.db"
  File /oname=db-anbar3.db "${PROJECT_DIR}/release-dist/db-anbar3.db"
  File /oname=db-anbar1 "${PROJECT_DIR}/release-dist/db-anbar1.db"
  File /oname=db-anbar2 "${PROJECT_DIR}/release-dist/db-anbar2.db"
  File /oname=db-anbar3 "${PROJECT_DIR}/release-dist/db-anbar3.db"

  ; Write Full Offline Web Application Files (includes /webfonts & /fonts & CSS)
  SetOutPath "$INSTDIR\app"
  File /r /x "server.cjs*" /x "downloads" /x "*.exe" /x "*.map" /x "*.blockmap" "${PROJECT_DIR}/dist/*"
  SetOutPath "$INSTDIR"

  ; Silent Non-Admin User-Fonts Registration (never writes to $FONTS so zero permission errors)
  ClearErrors
  SetOutPath "$INSTDIR\fonts"
  File /oname=Vazirmatn-Regular.ttf "${PROJECT_DIR}/public/fonts/Vazirmatn-Light.ttf"
  File /oname=Vazirmatn-Bold.ttf "${PROJECT_DIR}/public/fonts/Vazirmatn-ExtraBold.ttf"
  File "${PROJECT_DIR}/public/fonts/Vazirmatn-Light.ttf"
  File "${PROJECT_DIR}/public/fonts/Vazirmatn-ExtraBold.ttf"
  File "${PROJECT_DIR}/public/fonts/Vazirmatn-Thin.ttf"
  SetOutPath "$INSTDIR"

  ClearErrors
  CreateDirectory "$LOCALAPPDATA\Microsoft\Windows\Fonts"
  CopyFiles /SILENT "$INSTDIR\fonts\*.ttf" "$LOCALAPPDATA\Microsoft\Windows\Fonts"
  WriteRegStr HKCU "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Vazirmatn (TrueType)" "$LOCALAPPDATA\Microsoft\Windows\Fonts\Vazirmatn-Regular.ttf"
  WriteRegStr HKCU "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Vazirmatn Bold (TrueType)" "$LOCALAPPDATA\Microsoft\Windows\Fonts\Vazirmatn-Bold.ttf"
  WriteRegStr HKCU "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Vazirmatn ExtraBold (TrueType)" "$LOCALAPPDATA\Microsoft\Windows\Fonts\Vazirmatn-ExtraBold.ttf"
  WriteRegStr HKCU "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Vazirmatn Light (TrueType)" "$LOCALAPPDATA\Microsoft\Windows\Fonts\Vazirmatn-Light.ttf"
  WriteRegStr HKCU "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "Vazirmatn Thin (TrueType)" "$LOCALAPPDATA\Microsoft\Windows\Fonts\Vazirmatn-Thin.ttf"
  System::Call "gdi32::AddFontResource(t '$LOCALAPPDATA\Microsoft\Windows\Fonts\Vazirmatn-Regular.ttf') i .r0"
  System::Call "gdi32::AddFontResource(t '$LOCALAPPDATA\Microsoft\Windows\Fonts\Vazirmatn-Bold.ttf') i .r0"
  System::Call "user32::SendMessageTimeout(i 0xFFFF, i 0x001D, i 0, i 0, i 2, i 1000, *i 0)"
  ClearErrors

  ; Default Intranet LAN Role: AUTO (Automatically connects to LAN Hub when offline, or serves locally)
  ClearErrors
  FileOpen $0 "$INSTDIR\intranet_role.txt" w
  IfErrors +3
    FileWrite $0 "AUTO$\r$\n"
    FileClose $0
  ClearErrors

  ; Attempt silent Windows Firewall exception for Intranet TCP 3000 & UDP 3001 (succeeds silently if Admin, harmlessly ignored if standard user)
  nsExec::Exec 'netsh advfirewall firewall delete rule name="MGas Inventory Intranet TCP"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="MGas Inventory Intranet UDP"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="MGas Inventory Intranet TCP" dir=in action=allow program="$INSTDIR\${APP_EXE}" protocol=TCP localport=3000 profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="MGas Inventory Intranet UDP" dir=in action=allow program="$INSTDIR\${APP_EXE}" protocol=UDP localport=3001 profile=any'
  ClearErrors

  ; Create Web Portal Internet URL Target (https://anbar.mgas.ir)
  WriteINIStr "$INSTDIR\${WEB_SHORTCUT_NAME}.url" "InternetShortcut" "URL" "${WEB_CLOUD_URL}"
  WriteINIStr "$INSTDIR\${WEB_SHORTCUT_NAME}.url" "InternetShortcut" "IconIndex" "0"
  WriteINIStr "$INSTDIR\${WEB_SHORTCUT_NAME}.url" "InternetShortcut" "IconFile" "$INSTDIR\logo.ico"

  ; Create Uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Create Clean Start Menu Shortcuts (no log viewer)
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\logo.ico" 0 SW_SHOWNORMAL "" "سامانه مدیریت انبارداری ام گاز"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${WEB_SHORTCUT_NAME}.lnk" "$INSTDIR\${WEB_SHORTCUT_NAME}.url" "" "$INSTDIR\logo.ico" 0 SW_SHOWNORMAL "" "نسخه وب سامانه (anbar.mgas.ir)"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\حذف ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0
  CreateShortcut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\logo.ico" 0 SW_SHOWNORMAL "" "سامانه مدیریت انبارداری ام گاز"

  ; STRICTLY TWO Desktop Shortcuts ONLY: (1) Desktop App + (2) Web Version (https://anbar.mgas.ir)
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\logo.ico" 0 SW_SHOWNORMAL "" "سامانه مدیریت انبارداری ام گاز"
  CreateShortcut "$DESKTOP\${WEB_SHORTCUT_NAME}.lnk" "$INSTDIR\${WEB_SHORTCUT_NAME}.url" "" "$INSTDIR\logo.ico" 0 SW_SHOWNORMAL "" "نسخه وب انبارداری ام گاز (anbar.mgas.ir)"

  ; Registry Keys for Windows Add/Remove Programs
  WriteRegStr HKCU "Software\MGasInventory" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory" "DisplayIcon" "$INSTDIR\logo.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory" "URLInfoAbout" "${WEB_CLOUD_URL}"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory" "NoRepair" 1
SectionEnd

; Uninstaller Section
Section "Uninstall"
  ExecWait 'cmd.exe /C taskkill /F /IM "${APP_EXE}" /T'

  ; Remove Desktop & Start Menu Shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$DESKTOP\${WEB_SHORTCUT_NAME}.lnk"
  Delete "$DESKTOP\مشاهده لاگ انبارداری ام گاز.lnk"
  Delete "$DESKTOP\سرور ابری anbar.mgas.ir.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${WEB_SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\مشاهده لاگ اجرای برنامه.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\پوشه نصب برنامه (Open Folder).lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\اجرای مستقیم تحت مرورگر.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\حذف ${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  ; Remove Files and App Directory
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\fonts"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\MGas_Execution_Log.txt"
  Delete "$INSTDIR\logo.ico"
  Delete "$INSTDIR\MGasInventory.bat"
  Delete "$INSTDIR\انبارداری ام گاز.url"
  Delete "$INSTDIR\${WEB_SHORTCUT_NAME}.url"
  Delete "$INSTDIR\سرور ابری anbar.mgas.ir.url"
  Delete "$INSTDIR\db-anbar1.db"
  Delete "$INSTDIR\db-anbar2.db"
  Delete "$INSTDIR\db-anbar3.db"
  Delete "$INSTDIR\db-anbar1"
  Delete "$INSTDIR\db-anbar2"
  Delete "$INSTDIR\db-anbar3"
  Delete "$INSTDIR\intranet_role.txt"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  nsExec::Exec 'netsh advfirewall firewall delete rule name="MGas Inventory Intranet TCP"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="MGas Inventory Intranet UDP"'

  ; Remove Registry Keys
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MGasInventory"
  DeleteRegKey HKCU "Software\MGasInventory"
SectionEnd
