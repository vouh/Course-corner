@echo off
REM Course Corner M-Pesa Server Installation Script for Windows
REM This script sets up the M-Pesa payment server locally

echo.
echo ============================================
echo Course Corner M-Pesa Server Setup
echo ============================================
echo.

REM Check if Node.js is installed
echo Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo X Node.js is not installed!
    echo.
    echo Please install Node.js 18.x or higher from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set node_version=%%i
echo + Node.js found: %node_version%
echo.

REM Navigate to server directory
echo Navigating to server directory...
cd server
if %errorlevel% neq 0 (
    echo.
    echo X Failed to navigate to server directory
    echo.
    pause
    exit /b 1
)
echo + In server directory
echo.

REM Check if .env exists
echo Checking for .env file...
if not exist ".env" (
    echo.
    echo ! WARNING: .env file not found in server directory!
    echo.
    echo Please copy your .env file to the server folder:
    echo   copy ..\.env .env
    echo.
    echo Or create a new .env file with your M-Pesa credentials.
    echo See .env.example for reference.
    echo.
    pause
    exit /b 1
)
echo + .env file found
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo X Failed to install dependencies
        echo.
        pause
        exit /b 1
    )
    echo + Dependencies installed successfully
) else (
    echo + Dependencies already installed
)
echo.

REM Start server
echo.
echo ============================================
echo Starting M-Pesa Payment Server...
echo ============================================
echo.
echo Server URL:      http://localhost:8080
echo Health Check:    http://localhost:8080/api/health
echo.
echo Press Ctrl+C to stop the server
echo.
echo ============================================
echo.

call npm run dev

pause
