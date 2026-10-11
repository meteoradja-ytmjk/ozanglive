@echo off
color 0A
cls
echo.
echo ========================================
echo   BUKA YOUTUBE TAB - PORT 7575
echo ========================================
echo.
echo Membuka YouTube tab di browser...
echo.

start http://localhost:7575/youtube

timeout /t 2 /nobreak >nul

echo.
color 0E
echo ========================================
echo   BROWSER SUDAH DIBUKA!
echo ========================================
echo.
echo URL: http://localhost:7575/youtube
echo.
echo JIKA HALAMAN PUTIH (BLANK):
echo.
echo 1. CLEAR BROWSER CACHE:
echo    - Tekan: Ctrl + Shift + Delete
echo    - Pilih: "Cached images and files"
echo    - Pilih: "All time"
echo    - Klik: "Clear data"
echo.
echo 2. HARD REFRESH:
echo    - Tekan: Ctrl + F5
echo.
echo 3. ATAU GUNAKAN INCOGNITO:
echo    - Tekan: Ctrl + Shift + N
echo    - Buka: http://localhost:7575/youtube
echo.
echo 4. ATAU CLEAR CACHE LEBIH DALAM:
echo    - Tekan: F12
echo    - Klik kanan tombol Refresh
echo    - Pilih: "Empty Cache and Hard Reload"
echo.
color 0A
echo ========================================
echo   Jika masih blank, aplikasi mungkin
echo   belum berjalan. Jalankan dulu:
echo   BUKA-APLIKASI-SEKARANG.bat
echo ========================================
echo.
pause
