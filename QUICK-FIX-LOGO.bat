@echo off
echo ========================================
echo   Quick Fix - MonsterLive Logo Setup
echo ========================================
echo.

echo Step 1: Checking files...
if not exist "public\images\logo.svg" (
    echo ERROR: logo.svg not found!
    pause
    exit /b 1
)

echo Step 2: Creating temporary logo files...
echo (You will replace these with Monster Live logo later)

REM Copy existing logo as temporary placeholder
copy /Y "public\images\logo.svg" "public\images\logo-default.png" >nul 2>&1
copy /Y "public\images\logo.svg" "public\images\favicon-default.png" >nul 2>&1

echo   - logo-default.png created (temporary)
echo   - favicon-default.png created (temporary)
echo.

echo Step 3: Fixing database...
node fix-branding-table.js

echo.
echo ========================================
echo   IMPORTANT: Next Steps
echo ========================================
echo.
echo 1. Restart your application
echo 2. Login as admin
echo 3. Go to Settings - Branding
echo 4. Upload Monster Live logo (the image you showed me)
echo 5. Upload Monster Live favicon
echo 6. Click Save
echo.
echo The uploaded files will become the new defaults!
echo.
pause
