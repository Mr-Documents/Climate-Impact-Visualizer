@echo off
echo Starting Climate Impact Visualizer Backend...
echo.

REM Check if .env file exists
if not exist ".env" (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and configure your environment variables.
    echo.
    echo Required variables:
    echo - SUPABASE_URL
    echo - SUPABASE_SERVICE_ROLE_KEY
    echo.
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Start the server
echo Starting server on port 5000...
npm start

pause
