@echo off
cd /d %~dp0
set SITE=%~1
if "%SITE%"=="" set SITE=home
node scripts\build-site.js %SITE% || exit /b 1
npx --yes serve dist -p 3000 --no-clipboard
