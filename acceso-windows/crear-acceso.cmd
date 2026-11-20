@echo off
rem Traductor de reuniones - crea el acceso directo en el escritorio y en el menu Inicio.
rem Ejecuta crear-acceso.ps1 (que debe estar en esta misma carpeta) sin cambiar la configuracion de Windows.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear-acceso.ps1"
