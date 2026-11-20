<#
  Traductor de reuniones - acceso directo para Windows (plan B).

  Crea un acceso «Traductor de reuniones» en el escritorio y en el menú Inicio que abre
  la app en su propia ventana de Google Chrome (modo aplicación, sin barra de direcciones),
  con el icono de la app. No instala ningún programa: solo crea los dos accesos y guarda
  el icono (unos 30 KB) en %LOCALAPPDATA%\TraductorReuniones.

  Cómo usarlo: clic derecho en este archivo -> «Ejecutar con PowerShell».
  (O doble clic en crear-acceso.cmd, si está en la misma carpeta.)
#>
param(
  # Solo para pruebas: crea el acceso en esta carpeta en lugar del escritorio y el menú Inicio.
  [string]$Carpeta,
  # Solo para pruebas: dónde guardar el icono.
  [string]$CarpetaIcono = (Join-Path $env:LOCALAPPDATA 'TraductorReuniones')
)

$ErrorActionPreference = 'Stop'
$url = 'https://iaskainet.github.io/traductor-reuniones/'
$nombre = 'Traductor de reuniones'

function Terminar([int]$codigo) {
  if (-not $Carpeta) { Read-Host 'Pulsa Intro para cerrar' | Out-Null }
  exit $codigo
}

try {
  # 1. Buscar Google Chrome.
  $candidatos = @()
  foreach ($clave in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
                     'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe') {
    $valor = (Get-ItemProperty -Path $clave -ErrorAction SilentlyContinue).'(default)'
    if ($valor) { $candidatos += $valor }
  }
  $candidatos += @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  )
  $chrome = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $chrome) {
    Write-Host 'No encuentro Google Chrome en este PC. Instálalo desde https://www.google.com/chrome/ y vuelve a ejecutar este archivo.' -ForegroundColor Red
    Terminar 1
  }

  # 2. Icono: el de esta carpeta, o se descarga de la web de la app si no está.
  New-Item -ItemType Directory -Force -Path $CarpetaIcono | Out-Null
  $icono = Join-Path $CarpetaIcono 'icono.ico'
  $iconoLocal = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'icono.ico' } else { $null }
  if ($iconoLocal -and (Test-Path $iconoLocal)) {
    Copy-Item -Path $iconoLocal -Destination $icono -Force
  } else {
    Invoke-WebRequest -UseBasicParsing -Uri ($url + 'iconos/icono.ico') -OutFile $icono
  }

  # 3. Crear los accesos directos.
  $destinos = if ($Carpeta) { @($Carpeta) } else {
    @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
  }
  $shell = New-Object -ComObject WScript.Shell
  foreach ($destino in $destinos) {
    $ruta = Join-Path $destino "$nombre.lnk"
    $acceso = $shell.CreateShortcut($ruta)
    $acceso.TargetPath = $chrome
    $acceso.Arguments = "--app=$url"
    $acceso.WorkingDirectory = Split-Path -Parent $chrome
    $acceso.IconLocation = "$icono,0"
    $acceso.Description = 'Abre el Traductor de reuniones en su propia ventana de Chrome'
    $acceso.Save()
    Write-Host "Creado: $ruta" -ForegroundColor Green
  }
  Write-Host ''
  Write-Host 'Listo. Para anclarlo a la barra de tareas: ábrelo, haz clic derecho en su icono de la barra de tareas y elige «Anclar a la barra de tareas».'
  Terminar 0
} catch {
  Write-Host "No se ha podido crear el acceso: $($_.Exception.Message)" -ForegroundColor Red
  Terminar 1
}
