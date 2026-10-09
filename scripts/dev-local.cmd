@echo off
rem Local development server with the embedded database in .\data-dev (no PostgreSQL needed).
cd /d "%~dp0.."
if "%DATA_DIR%"=="" set DATA_DIR=./data-dev
set LOG_QUIET=1
if "%PORT%"=="" set PORT=4317
set PUBLIC_BASE_URL=http://localhost:%PORT%
npx next dev -p %PORT%
