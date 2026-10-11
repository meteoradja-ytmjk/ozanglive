@echo off
echo ============================================
echo    FULL CLEAN & RESTART
echo    (Use this if changes not appearing)
echo ============================================
echo.

REM Stop any running node processes
echo [1/6] Stopping current app...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

REM Pull latest changes
echo.
echo [2/6] Pulling latest changes from GitHub...
git pull origin feature/professional-stream-key-selector

REM Remove node_modules (optional, uncomment if needed)
REM echo.
REM echo [3/6] Removing node_modules...
REM rmdir /S /Q node_modules

REM Clear npm cache
echo.
echo [3/6] Clearing npm cache...
npm cache clean --force

REM Install dependencies
echo.
echo [4/6] Installing dependencies...
npm install

REM Clear browser cache reminder
echo.
echo [5/6] IMPORTANT: Clear your browser cache!
echo    Chrome: Ctrl+Shift+Delete
echo    Or Hard Refresh: Ctrl+Shift+R
echo.
timeout /t 5 /nobreak

REM Start the application
echo.
echo [6/6] Starting application...
echo.
echo ============================================
echo    APPLICATION STARTING...
echo    
echo    After app starts:
echo    1. Open browser
echo    2. Hard refresh (Ctrl+Shift+R)
echo    3. Test Control Room
echo    
echo    Press Ctrl+C to stop
echo ============================================
echo.

npm start

pause
