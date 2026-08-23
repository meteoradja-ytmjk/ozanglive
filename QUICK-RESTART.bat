@echo off
echo ============================================
echo    QUICK RESTART (SIMPLE VERSION)
echo ============================================
echo.

REM Stop any running node processes
echo Stopping current app...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Starting application...
echo.

npm start

pause
