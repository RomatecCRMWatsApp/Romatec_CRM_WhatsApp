@echo off
chcp 65001 >nul
title Romatec CRM — Build .exe

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   Romatec CRM — Build do instalador  ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo [1/4] Instalando dependencias...
call npm install --silent
if errorlevel 1 ( echo ERRO: npm install falhou & pause & exit /b 1 )

echo [2/4] Gerando icone...
node make-icon.mjs
if errorlevel 1 ( echo ERRO: make-icon falhou & pause & exit /b 1 )

echo [3/4] Compilando instalador Windows...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run build:win
if errorlevel 1 ( echo ERRO: build falhou & pause & exit /b 1 )

echo.
echo  ✅ Instalador gerado em:
echo     %~dp0dist\
echo.

echo [4/4] Abrindo pasta dist...
explorer "%~dp0dist"

echo.
echo  Pressione qualquer tecla para fechar...
pause >nul
