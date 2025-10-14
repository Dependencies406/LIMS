@echo off
cls
echo.
echo ============================================================
echo   LIMS - Laboratory Information Management System
echo ============================================================
echo.
echo Starting servers...
echo.

REM Kill any existing processes on ports 3001 and 5173
echo Checking for existing servers...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    if "%%a" NEQ "0" (
        echo Stopping old PDF server...
        taskkill /F /PID %%a >nul 2>&1
    )
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    if "%%a" NEQ "0" (
        echo Stopping old frontend...
        taskkill /F /PID %%a >nul 2>&1
    )
)

timeout /t 2 /nobreak >nul

echo.
echo [1/2] Starting PDF Server (Port 3001)...
start "LIMS PDF Server" cmd /k "cd /d %~dp0server && echo PDF Server starting... && node index.js"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend (Port 5173)...
start "LIMS Frontend" cmd /k "cd /d %~dp0 && echo Frontend starting... && npm run dev"

timeout /t 2 /nobreak >nul

echo.
echo ============================================================
echo   Both servers are starting!
echo ============================================================
echo.
echo   PDF Server:  http://localhost:3001
echo   Frontend:    http://localhost:5173
echo.
echo   Two new windows have opened for each server.
echo   You can close THIS window now.
echo.
echo   To stop the servers: Close both server windows
echo   or press Ctrl+C in each window.
echo ============================================================
echo.
pause

