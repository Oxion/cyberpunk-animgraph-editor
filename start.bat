@echo off
echo Starting Cyberpunk 2077 Animgraph Editor...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo Starting development server...
echo.
echo IMPORTANT: After Vite starts, try these URLs:
echo - http://localhost:5001
echo - http://127.0.0.1:5001
echo - http://[your-local-ip]:5001
echo.
echo If you see "Local:" and "Network:" in the terminal, use the Network URL
echo.

npm run dev

pause
