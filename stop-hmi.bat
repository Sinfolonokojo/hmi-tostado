@echo off
title HMI Tostado - Detener
echo Deteniendo el puente y el tunel...

REM cerrar por titulo de ventana (no afecta otros procesos node)
taskkill /f /fi "WINDOWTITLE eq HMI Bridge*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq HMI Tunnel*" >nul 2>&1
REM el tunel a veces queda como proceso suelto
taskkill /f /im cloudflared.exe >nul 2>&1

echo Listo. Si alguna ventana sigue abierta, cierrala manualmente.
echo(
pause
