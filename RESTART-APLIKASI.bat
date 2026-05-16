@echo off
echo ========================================
echo   RESTART APLIKASI OZANGLIVE
echo ========================================
echo.

echo [1/3] Menghentikan aplikasi yang sedang berjalan...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo      ^> Aplikasi berhasil dihentikan
) else (
    echo      ^> Tidak ada aplikasi yang berjalan
)
echo.

echo [2/3] Menunggu 2 detik...
timeout /t 2 /nobreak >nul
echo      ^> Siap untuk start ulang
echo.

echo [3/3] Memulai aplikasi...
echo      ^> Aplikasi akan berjalan di window baru
echo      ^> Jangan tutup window tersebut!
echo.

start "OzangLive Server" cmd /k "node app.js"

echo.
echo ========================================
echo   APLIKASI BERHASIL DI-RESTART!
echo ========================================
echo.
echo LANGKAH SELANJUTNYA:
echo 1. Buka browser
echo 2. Tekan Ctrl + Shift + Delete
echo 3. Clear "Cached images and files"
echo 4. Buka http://localhost:3000/youtube
echo 5. Tekan Ctrl + F5 untuk hard refresh
echo.
echo Jika masih rusak, buka YOUTUBE-FIX-ENCODING.md
echo untuk panduan troubleshooting lengkap.
echo.
pause
