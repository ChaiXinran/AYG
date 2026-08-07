@echo off
cd /d %~dp0
npx --yes serve . -p 3000 --no-clipboard
