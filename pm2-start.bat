@echo off
REM PM2 Start Script for StreamFlow (Windows)
REM This script helps manage the StreamFlow application with PM2

echo ========================================
echo    StreamFlow PM2 Manager
echo ========================================

REM Check if PM2 is installed
where pm2 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo PM2 is not installed!
    echo Installing PM2 globally...
    npm install -g pm2
)

if "%1"=="" goto usage
if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="restart" goto restart
if "%1"=="reload" goto reload
if "%1"=="status" goto status
if "%1"=="logs" goto logs
if "%1"=="monit" goto monit
if "%1"=="startup" goto startup
if "%1"=="delete" goto delete
goto usage

:start
echo Starting StreamFlow...
pm2 start ecosystem.config.js
pm2 save
goto done

:stop
echo Stopping StreamFlow...
pm2 stop streamflow
goto done

:restart
echo Restarting StreamFlow...
pm2 restart streamflow
goto done

:reload
echo Reloading StreamFlow (zero-downtime)...
pm2 reload streamflow
goto done

:status
pm2 status
goto done

:logs
pm2 logs streamflow --lines 100
goto done

:monit
pm2 monit
goto done

:startup
echo Setting up PM2 to start on system boot...
pm2-startup install
pm2 save
echo PM2 will now auto-start StreamFlow on system boot
goto done

:delete
echo Removing StreamFlow from PM2...
pm2 delete streamflow
goto done

:usage
echo Usage: pm2-start.bat [command]
echo.
echo Commands:
echo   start   - Start StreamFlow with PM2
echo   stop    - Stop StreamFlow
echo   restart - Restart StreamFlow
echo   reload  - Zero-downtime reload
echo   status  - Show PM2 process status
echo   logs    - View application logs
echo   monit   - Open PM2 monitoring dashboard
echo   startup - Configure PM2 to start on system boot
echo   delete  - Remove StreamFlow from PM2
goto end

:done
echo Done!

:end
