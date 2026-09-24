# Respaldo de la base de datos de Supabase con pg_dump.
#
# El plan Free de Supabase NO hace respaldos automaticos; este script es esa red de
# seguridad. Guarda las tablas de la app (public), los usuarios (auth) y el registro de
# archivos (storage). NO guarda los archivos en si (COA, fichas, avatares): esos viven en
# Storage y sobreviven mientras el proyecto exista.
#
# - Deja cada copia en <Destino>\respaldo-etiquetado-AAAA-MM-DD-HHMM.dump
# - Comprueba que la copia se puede leer (pg_restore --list) antes de darla por buena.
# - Conserva las ultimas <Conservar> copias y borra las mas viejas.
# - Anota lo que hizo en <Destino>\respaldo.log y termina con codigo distinto de 0 si falla.
#
# La contrasena NUNCA va en este archivo. pg_dump la toma de un archivo pgpass.conf que
# crea a mano quien administra el respaldo:
#   Ruta:     %APPDATA%\postgresql\pgpass.conf
#   Contenido (una sola linea, sin espacios extra):
#     aws-0-us-west-2.pooler.supabase.com:5432:postgres:postgres.<REF_DEL_PROYECTO>:<CONTRASENA>
#   (usa una contrasena sin los caracteres : y \ ; si la rotas en Supabase, cambiala aqui)
# Tambien sirve definir la variable de entorno PGPASSWORD solo para esa sesion.
#
# Uso a mano:  powershell -ExecutionPolicy Bypass -File scripts\respaldar-base.ps1
# Programado:  ver README del backend o pedir a quien mantiene el sistema.

param(
    [string]$Servidor = 'aws-0-us-west-2.pooler.supabase.com',
    [int]$Puerto = 5432,
    [string]$Base = 'postgres',
    # Es "postgres.<ref del proyecto>" (el ref esta en la URL del panel de Supabase).
    [string]$Usuario = 'postgres.gmblfngswtriiahabxkj',
    [string]$Destino = 'C:\respaldos',
    [int]$Conservar = 8
)

$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$log = Join-Path $Destino 'respaldo.log'

function Anotar([string]$mensaje) {
    $linea = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $mensaje
    Write-Host $linea
    Add-Content -Path $log -Value $linea
}

function Fallar([string]$mensaje) {
    Anotar "ERROR: $mensaje"
    exit 1
}

# Localiza pg_dump / pg_restore: en el PATH o en la instalacion tipica de PostgreSQL.
function Buscar([string]$nombre) {
    $comando = Get-Command $nombre -ErrorAction SilentlyContinue
    if ($comando) { return $comando.Source }
    $candidatos = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\$nombre.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending
    if ($candidatos) { return $candidatos[0].FullName }
    return $null
}

$pgDump = Buscar 'pg_dump'
$pgRestore = Buscar 'pg_restore'
if (-not $pgDump -or -not $pgRestore) {
    Fallar 'No se encontro pg_dump/pg_restore. Instala las herramientas de cliente de PostgreSQL.'
}

$pgpass = Join-Path $env:APPDATA 'postgresql\pgpass.conf'
if (-not $env:PGPASSWORD -and -not (Test-Path $pgpass)) {
    Fallar "No hay contrasena: crea $pgpass (ver la cabecera de este script) o define PGPASSWORD."
}

$sello = Get-Date -Format 'yyyy-MM-dd-HHmm'
$final = Join-Path $Destino "respaldo-etiquetado-$sello.dump"
$parcial = "$final.parcial"
$errores = "$final.err"

Anotar "Iniciando respaldo de $Base en $Servidor como $Usuario"

# -w: nunca pedir contrasena por teclado (si falta, falla en vez de quedarse colgado).
$argumentos = @(
    '-h', $Servidor, '-p', $Puerto, '-U', $Usuario, '-d', $Base, '-w',
    '--schema=public', '--schema=auth', '--schema=storage',
    '--no-owner', '--no-privileges', '-Fc', '-f', $parcial
)
$proceso = Start-Process -FilePath $pgDump -ArgumentList $argumentos -NoNewWindow -Wait -PassThru `
    -RedirectStandardError $errores

if ($proceso.ExitCode -ne 0) {
    $detalle = if (Test-Path $errores) { (Get-Content $errores -Raw).Trim() } else { '' }
    Remove-Item $parcial, $errores -ErrorAction SilentlyContinue
    Fallar "pg_dump fallo (codigo $($proceso.ExitCode)). $detalle"
}
Remove-Item $errores -ErrorAction SilentlyContinue

# Una copia que no se puede leer no es una copia: se descarta.
$tamano = (Get-Item $parcial).Length
if ($tamano -lt 10KB) {
    Remove-Item $parcial -ErrorAction SilentlyContinue
    Fallar "La copia pesa solo $tamano bytes; se descarta."
}
$lista = & $pgRestore --list $parcial 2>$null
if ($LASTEXITCODE -ne 0 -or -not ($lista | Select-String 'TABLE DATA')) {
    Remove-Item $parcial -ErrorAction SilentlyContinue
    Fallar 'La copia no se pudo leer con pg_restore --list; se descarta.'
}

Move-Item -Path $parcial -Destination $final
$tablas = @($lista | Select-String 'TABLE DATA').Count
Anotar ("Respaldo OK: {0} ({1:N0} KB, {2} tablas)" -f $final, ($tamano / 1KB), $tablas)

# Rotacion: deja solo las ultimas $Conservar copias.
$copias = Get-ChildItem -Path $Destino -Filter 'respaldo-etiquetado-*.dump' | Sort-Object Name -Descending
$sobran = @($copias | Select-Object -Skip $Conservar)
foreach ($vieja in $sobran) {
    Remove-Item $vieja.FullName
    Anotar "Se borro la copia antigua $($vieja.Name)"
}

exit 0
