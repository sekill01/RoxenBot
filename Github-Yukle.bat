@echo off
cd /d "%~dp0"
echo ==========================================
echo    RoxenBot Cloud - GitHub Guncelleme
echo ==========================================
echo.
git add .
git commit -m "Kick API and Centrifugo update"
git push origin main
echo.
echo Islem tamamlandi.
pause
