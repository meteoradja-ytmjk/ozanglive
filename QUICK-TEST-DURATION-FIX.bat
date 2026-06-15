@echo off
color 0A
cls
echo.
echo ========================================
echo   TEST DURATION ACCURACY FIX
echo ========================================
echo.
echo Testing apakah stream stop sesuai durasi...
echo.

node test-duration-accuracy.js

echo.
echo ========================================
echo   TEST SELESAI
echo ========================================
echo.
echo Jika ada stream OVERDUE:
echo   - Check logs/app.log
echo   - Restart aplikasi
echo   - Run test ini lagi
echo.
pause
