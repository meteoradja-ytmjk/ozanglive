@echo off
color 0C
cls
echo.
echo ========================================
echo   PERBAIKAN MOBILE UI - YOUTUBE TAB
echo ========================================
echo.
color 0E
echo SAYA MINTA MAAF ATAS MASALAH INI!
echo.
echo File sudah diperbaiki ke versi dengan
echo MOBILE UI YANG BAGUS (seperti screenshot)
echo.
color 0A
echo ========================================
echo.

echo [STEP 1/4] Menghentikan aplikasi lama...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo      [OK] Aplikasi dihentikan
) else (
    echo      [INFO] Tidak ada aplikasi yang berjalan
)
echo.

echo [STEP 2/4] Menunggu 3 detik...
timeout /t 3 /nobreak >nul
echo      [OK] Siap restart
echo.

echo [STEP 3/4] Memulai aplikasi...
start "OzangLive - JANGAN TUTUP!" cmd /k "color 0A & echo ========================================== & echo    APLIKASI SEDANG BERJALAN & echo    JANGAN TUTUP WINDOW INI! & echo ========================================== & echo. & node app.js"
timeout /t 2 /nobreak >nul
echo      [OK] Aplikasi berjalan di window baru
echo.

echo [STEP 4/4] Membuka browser...
timeout /t 2 /nobreak >nul
start http://localhost:3000/youtube
echo      [OK] Browser dibuka
echo.

color 0E
echo ========================================
echo   APLIKASI SUDAH RESTART!
echo ========================================
echo.
echo.
color 0C
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo   LANGKAH WAJIB - CLEAR BROWSER CACHE!
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
color 0E
echo TANPA CLEAR CACHE, UI AKAN TETAP RUSAK!
echo.
echo Cara clear cache:
echo.
echo 1. Tekan: Ctrl + Shift + Delete
echo 2. Pilih: "Cached images and files"
echo 3. Pilih: "All time" (BUKAN "Last hour")
echo 4. Klik: "Clear data"
echo.
echo Setelah clear cache:
echo.
echo 5. Tekan: Ctrl + F5 (hard refresh)
echo.
echo Untuk test mobile view:
echo.
echo 6. Tekan: F12 (Developer Tools)
echo 7. Tekan: Ctrl + Shift + M (Toggle device)
echo 8. Pilih: iPhone atau Android
echo 9. Tekan: Ctrl + F5 lagi
echo.
color 0A
echo ========================================
echo   Mobile UI sekarang sudah bagus!
echo   Tinggal clear cache browser saja!
echo ========================================
echo.
color 0E
echo Baca file: PERBAIKAN-MOBILE-UI.md
echo untuk panduan lengkap.
echo.
pause
