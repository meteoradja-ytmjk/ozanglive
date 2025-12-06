@echo off
echo ========================================
echo   Git Push to GitHub
echo ========================================
echo.

:: Set timestamp for commit message
for /f "tokens=1-4 delims=/ " %%a in ('date /t') do set DATE=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIME=%%a:%%b

:: Ask for commit message
set /p COMMIT_MSG="Masukkan commit message (atau tekan Enter untuk default): "

:: Use default message if empty
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update %DATE% %TIME%

echo.
echo [1/3] Adding all changes...
git add .

echo.
echo [2/3] Committing with message: %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"

echo.
echo [3/3] Pushing to GitHub...
git push origin main

echo.
echo ========================================
echo   Push completed!
echo ========================================
pause
