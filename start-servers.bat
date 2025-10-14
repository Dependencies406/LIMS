@echo off
echo ====================================
echo Starting LIMS Application
echo ====================================
echo.
echo Starting PDF Server on port 3001...
start "PDF Server" cmd /k "cd server && npm start"
timeout /t 3 /nobreak > nul
echo.
echo Starting Frontend on port 5173...
start "Frontend" cmd /k "npm run dev"
echo.
echo ====================================
echo Both servers are starting...
echo.
echo PDF Server: http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Close this window to keep servers running
echo ====================================

