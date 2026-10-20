@echo off
chcp 65001 >nul
title RoxenBot Cloud Multi-Tenant SaaS Platform
echo ======================================================
echo         ROXENBOT CLOUD SAAS BASLATILIYOR...
echo ======================================================
echo.
echo :: Port 3005 cakismalarini temizle
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3005') do taskkill /F /PID %%a >nul 2>&1
echo.
echo [*] Sunucu baslatiliyor: http://localhost:3005
echo [*] Tarayicinizda http://localhost:3005 adresini acin.
echo.
node server.js
pause
