@echo off
echo ========================================
echo   FORCE CLEAR ALL - HARD RESET
echo ========================================
echo.
echo PERINGATAN: Ini akan menghapus SEMUA sessions!
echo Semua user yang sedang login akan logout.
echo.
pause
echo.

echo [1/5] Stopping application...
pm2 stop ozanglive
timeout /t 2 >nul
echo      Done!
echo.

echo [2/5] Deleting ALL session files...
if exist "db\sessions.db" del /F /Q "db\sessions.db"
if exist "db\sessions.db-shm" del /F /Q "db\sessions.db-shm"
if exist "db\sessions.db-wal" del /F /Q "db\sessions.db-wal"
if exist "db\sessions.db.backup" del /F /Q "db\sessions.db.backup"
echo      All session files deleted!
echo.

echo [3/5] Clearing PM2 logs...
pm2 flush
echo      Logs cleared!
echo.

echo [4/5] Starting application...
pm2 start ozanglive
timeout /t 5 >nul
echo      Done!
echo.

echo [5/5] Checking status...
pm2 status
echo.

echo ========================================
echo   HARD RESET COMPLETE!
echo ========================================
echo.
echo APLIKASI SUDAH RESTART DENGAN SESSION BARU
echo.
echo LANGKAH WAJIB - IKUTI DENGAN TELITI:
echo.
echo 1. TUTUP SEMUA WINDOW BROWSER
echo    - Tutup semua tab
echo    - Tutup semua window
echo    - Pastikan tidak ada browser yang running
echo.
echo 2. BUKA TASK MANAGER (Ctrl+Shift+Esc)
echo    - Cari proses: chrome.exe / firefox.exe / msedge.exe
echo    - Klik kanan -^> End Task
echo    - Pastikan SEMUA proses browser tertutup
echo.
echo 3. BUKA BROWSER BARU DALAM MODE INCOGNITO
echo    Chrome: Ctrl + Shift + N
echo    Firefox: Ctrl + Shift + P
echo    Edge: Ctrl + Shift + N
echo.
echo 4. AKSES APLIKASI:
echo    http://localhost:7575
echo.
echo 5. LOGIN dengan username dan password
echo.
echo JIKA MASIH ERROR "TOO MANY REDIRECTS":
echo    - Restart komputer
echo    - Gunakan browser berbeda
echo    - Atau hubungi support
echo.
pause
