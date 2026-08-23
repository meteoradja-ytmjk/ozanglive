@echo off
echo ============================================
echo    RESTART APP WITH LATEST CHANGES
echo ============================================
echo.

REM Stop any running node processes
echo [1/5] Stopping current app...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

REM Pull latest changes from GitHub
echo.
echo [2/5] Pulling latest changes from GitHub...
git pull origin feature/professional-stream-key-selector

REM Clear npm cache (optional but helps)
echo.
echo [3/5] Clearing npm cache...
npm cache clean --force

REM Install any new dependencies
echo.
echo [4/5] Installing dependencies...
npm install

REM Start the application
echo.
echo [5/5] Starting application...
echo.
echo ============================================
echo    APPLICATION STARTING...
echo    Press Ctrl+C to stop
echo ============================================
echo.

npm start

pause
