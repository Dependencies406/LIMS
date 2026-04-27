@echo off
REM Windows batch script to build standalone executable
REM This script builds the Firebase Setup Tool as a standalone .exe file

echo ============================================================
echo Firebase Setup Tool - Executable Builder (Windows)
echo ============================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH!
    echo Please install Python 3.6 or higher from https://www.python.org/
    pause
    exit /b 1
)

echo Python found!
echo.

REM Run the build script
python build-executable.py

echo.
echo ============================================================
echo Build process completed!
echo ============================================================
echo.
echo The executable will be in the 'dist' folder.
echo You can distribute FirebaseSetupTool.exe to any Windows PC.
echo.
pause
