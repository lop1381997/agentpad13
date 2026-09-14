@echo off
setlocal
rem Microsoft requires these runtime-folder ACLs for Fixed WebView2 on Windows 10.
icacls "%~dp0WebView2" /grant "*S-1-15-2-2:(OI)(CI)(RX)" "*S-1-15-2-1:(OI)(CI)(RX)" >nul
if errorlevel 1 (
  echo No se pueden preparar los permisos de WebView2. Extrae el ZIP en una carpeta local con permisos de escritura.
  pause
  exit /b 1
)
start "AgentPad13" /wait "%~dp0AgentPad13.exe"
