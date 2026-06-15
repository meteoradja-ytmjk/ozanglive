@echo off
color 0A
echo.
echo ========================================
echo   RESTART APLIKASI OZANGLIVE
echo ========================================
echo.
echo PERBAIKAN YOUTUBE TAB - VERSI STABIL
echo.
echo ========================================
echo.

echo [1/3] Menghentikan aplikasi yang sedang berjalan...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo      [OK] Aplikasi berhasil dihentikan
) else (
    echo      [INFO] Tidak ada aplikasi yang berjalan
)
echo.

echo [2/3] Menunggu 3 detik...
timeout /t 3 /nobreak >nul
echo      [OK] Siap untuk start ulang
echo.

echo [3/3] Memulai aplikasi...
echo      [INFO] Aplikasi akan berjalan di window baru
echo      [PENTING] Jangan tutup window tersebut!
echo.

start "OzangLive Server - JANGAN TUTUP WINDOW INI!" cmd /k "echo APLIKASI SEDANG BERJALAN - JANGAN TUTUP WINDOW INI! & echo. & node app.js"

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   APLIKASI BERHASIL DI-RESTART!
echo ========================================
echo.
color 0E
echo LANGKAH SELANJUTNYA (WAJIB!):
echo.
echo 1. CLEAR BROWSER CACHE:
echo    - Tekan Ctrl + Shift + Delete
echo    - Pilih "Cached images and files"
echo    - Pilih "All time"
echo    - Klik "Clear data"
echo.
echo 2. HARD REFRESH:
echo    - Buka http://localhost:3000/youtube
echo    - Tekan Ctrl + F5 (BUKAN F5 biasa!)
echo.
echo 3. JIKA MASIH RUSAK:
echo    - Coba buka di Incognito mode (Ctrl + Shift + N)
echo    - Baca file: PERBAIKAN-FINAL-YOUTUBE.md
echo.
color 0A
echo ========================================
echo   File sudah diperbaiki ke versi stabil!
echo   Tinggal clear cache browser saja!
echo ========================================
echo.
pause
