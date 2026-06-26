@echo off
setlocal enabledelayedexpansion
title HMI Tostado - Lanzador
cd /d "%~dp0"

echo(
echo ===============================================
echo    HMI TOSTADO  -  inicio rapido
echo ===============================================
echo(
echo  Asegurate de que el Arduino este conectado y
echo  que bridge\.env tenga el COM correcto (ej. COM9).
echo(

REM --- 1) Puente: lee el Arduino y expone el WebSocket en :8080 ---
echo [1/3] Iniciando el puente (bridge)...
start "HMI Bridge" cmd /k "cd /d "%~dp0bridge" && npm.cmd start"

REM --- 2) Tunel Cloudflare (registra la salida en un archivo para leer la URL) ---
set "LOG=%TEMP%\hmi-tunnel.log"
if exist "%LOG%" del "%LOG%" >nul 2>&1
echo [2/3] Iniciando el tunel Cloudflare...
start "HMI Tunnel" cmd /k "cloudflared tunnel --url http://localhost:8080 > "%LOG%" 2>&1"

REM --- 3) Esperar y extraer la URL publica del tunel ---
echo [3/3] Esperando la URL del tunel (hasta ~40s)...
set "PUBHOST="
set /a tries=0
:waitloop
set /a tries+=1
for /f "delims=" %%u in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$m = Select-String -Path '%LOG%' -Pattern '([a-z0-9-]+\.trycloudflare\.com)' | Select-Object -First 1; if ($m) { $m.Matches[0].Groups[1].Value }" 2^>nul') do set "PUBHOST=%%u"
if defined PUBHOST goto :goturl
if !tries! geq 40 goto :nourl
timeout /t 1 /nobreak >nul
goto :waitloop

:goturl
set "TABLET=https://origendelvalle.vercel.app/?bridge=wss://!PUBHOST!"
echo(
echo ===============================================
echo   ABRE ESTA DIRECCION EN LA TABLET:
echo(
echo   !TABLET!
echo(
echo   (copiada al portapapeles)
echo ===============================================
REM copiar al portapapeles
echo !TABLET!| clip
REM abrir tambien en este equipo para verificar
start "" "!TABLET!"
goto :end

:nourl
echo(
echo  No pude leer la URL automaticamente.
echo  Mira la ventana "HMI Tunnel", copia la linea https://....trycloudflare.com
echo  y abre en la tablet:
echo     https://origendelvalle.vercel.app/?bridge=wss://[ESA-URL-SIN-https://]
echo(

:end
echo(
echo  Deja ABIERTAS las ventanas "HMI Bridge" y "HMI Tunnel".
echo  Para detener todo: ejecuta stop-hmi.bat
echo(
pause
endlocal
