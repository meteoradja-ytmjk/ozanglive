@echo off
echo ========================================
echo   MEMBUKA APLIKASI OZANGLIVE
echo ========================================
echo.

echo [1/3] Membersihkan session lama...
pm2 stop ozanglive >nul 2>&1
timeout /t 2 /nobreak >nul

if exist "db\sessions.db" del /f /q "db\sessions.db" >nul 2>&1
if exist "db\sessions.db-shm" del /f /q "db\sessions.db-shm" >nul 2>&1
if exist "db\sessions.db-wal" del /f /q "db\sessions.db-wal" >nul 2>&1

echo [2/3] Memulai aplikasi...
pm2 start ozanglive >nul 2>&1
timeout /t 3 /nobreak >nul

echo [3/3] Membuka browser...
echo.
echo ========================================
echo   APLIKASI SIAP!
echo ========================================
echo.
echo URL: http://localhost:7575
echo.
echo PENTING:
echo - Browser akan terbuka dalam mode INCOGNITO
echo - Gunakan username dan password Anda
echo.
echo Membuka browser dalam 3 detik...
timeout /t 3 /nobreak >nul

REM Coba buka dengan Chrome Incognito
start chrome --incognito http://localhost:7575 >nul 2>&1

REM Jika Chrome tidak ada, coba Edge
if errorlevel 1 (
    start msedge -inprivate http://localhost:7575 >nul 2>&1
)

REM Jika Edge tidak ada, buka browser default
if errorlevel 1 (
    start http://localhost:7575
)

echo.
echo ========================================
echo Browser sudah dibuka!
echo ========================================
echo.
echo Jika browser tidak terbuka otomatis:
echo 1. Buka browser INCOGNITO secara manual
echo 2. Ketik: http://localhost:7575
echo 3. Login dengan username dan password
echo.
pause
