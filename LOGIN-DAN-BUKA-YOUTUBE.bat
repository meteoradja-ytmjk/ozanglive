@echo off
color 0C
cls
echo.
echo ========================================
echo   LOGIN DAN BUKA YOUTUBE TAB
echo ========================================
echo.
color 0E
echo MASALAH: Anda belum login!
echo.
echo YouTube tab memerlukan login terlebih dahulu.
echo.
color 0A
echo ========================================
echo.

echo [STEP 1/2] Membuka halaman login...
start http://localhost:7575/login
timeout /t 3 /nobreak >nul
echo      [OK] Halaman login dibuka
echo.

echo [STEP 2/2] Menunggu Anda login...
echo.
color 0E
echo ========================================
echo   SILAKAN LOGIN DI BROWSER
echo ========================================
echo.
echo Username: ozang88
echo Password: (password Anda)
echo.
echo Atau gunakan username: admin
echo.
echo Setelah login, YouTube tab akan terbuka otomatis.
echo.
timeout /t 5 /nobreak >nul

echo Membuka YouTube tab...
start http://localhost:7575/youtube
echo.
color 0A
echo ========================================
echo   SELESAI!
echo ========================================
echo.
color 0E
echo JIKA HALAMAN MASIH BLANK:
echo.
echo 1. Pastikan Anda sudah login
echo 2. Clear browser cache (Ctrl + Shift + Delete)
echo 3. Hard refresh (Ctrl + F5)
echo 4. Atau gunakan Incognito mode (Ctrl + Shift + N)
echo.
echo JIKA LUPA PASSWORD:
echo.
echo Buka: http://localhost:7575/register
echo Untuk membuat akun baru.
echo.
pause
