# Prueba de restauracion de un respaldo (el de respaldar-base.ps1).
#
# Un respaldo que nunca se restauro es solo una esperanza. Este script levanta un
# servidor PostgreSQL TEMPORAL y aislado (carpeta propia, puerto 5544, solo 127.0.0.1,
# sin contrasena), restaura ahi la copia y compara fila por fila contra lo que dice el
# archivo. Al terminar apaga y borra ese servidor. NO toca ninguna otra base, ni la
# de Supabase, ni un PostgreSQL que ya tengas instalado en el PC.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\probar-restauracion.ps1
#       powershell -ExecutionPolicy Bypass -File scripts\probar-restauracion.ps1 -Copia C:\respaldos\otro.dump
#
# Sale con codigo 0 solo si TODAS las tablas tienen las mismas filas que la copia.

param(
    [string]$Copia,
    [string]$Destino = 'C:\respaldos',
    [int]$Puerto = 5544
)

# 'Continue' a proposito: pg_restore escribe avisos inofensivos por stderr (p. ej. "ya existe el
# esquema public") y con 'Stop' PowerShell abortaria. Los fallos reales se detectan comparando filas.
$ErrorActionPreference = 'Continue'

function Buscar([string]$nombre) {
    $c = Get-Command $nombre -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $r = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\$nombre.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending
    if ($r) { return $r[0].FullName }
    throw "No se encontro $nombre. Instala las herramientas de PostgreSQL."
}

$initdb = Buscar 'initdb'; $pgCtl = Buscar 'pg_ctl'; $psql = Buscar 'psql'
$pgRestore = Buscar 'pg_restore'; $createdb = Buscar 'createdb'

if (-not $Copia) {
    $ultima = Get-ChildItem $Destino -Filter 'respaldo-etiquetado-*.dump' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if (-not $ultima) { throw "No hay copias en $Destino." }
    $Copia = $ultima.FullName
}
if (-not (Test-Path $Copia)) { throw "No existe la copia: $Copia" }
Write-Host "Copia a probar: $Copia ($([math]::Round((Get-Item $Copia).Length / 1KB)) KB)"

# Si el puerto ya esta ocupado, no seguimos: podria ser otra base y no queremos tocarla.
if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) {
    throw "El puerto $Puerto esta ocupado. Usa -Puerto con otro numero."
}

$carpeta = Join-Path $env:TEMP ("prueba-restauracion-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$datos = Join-Path $carpeta 'datos'
$erroresRestauracion = Join-Path $carpeta 'errores-restauracion.txt'
$iniciado = $false
$fallos = 0

try {
    New-Item -ItemType Directory -Force $carpeta | Out-Null

    Write-Host 'Creando servidor temporal...'
    & $initdb -D $datos -U postgres -A trust -E UTF8 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'initdb fallo.' }

    # La salida va a un archivo (cmd /c): con una tuberia de PowerShell, el servidor que queda
    # vivo hereda el extremo de la tuberia y PowerShell se queda esperando para siempre.
    $salidaArranque = Join-Path $carpeta 'arranque.txt'
    cmd /c "`"$pgCtl`" start -D `"$datos`" -w -l `"$(Join-Path $carpeta 'servidor.log')`" -o `"-p $Puerto -c listen_addresses=127.0.0.1`" > `"$salidaArranque`" 2>&1"
    if ($LASTEXITCODE -ne 0) { throw 'No arranco el servidor temporal (ver servidor.log).' }
    $iniciado = $true

    & $createdb -h 127.0.0.1 -p $Puerto -U postgres restauracion
    if ($LASTEXITCODE -ne 0) { throw 'createdb fallo.' }

    Write-Host 'Restaurando...'
    # Sin --exit-on-error: se restaura todo lo posible y se cuentan los errores despues.
    & $pgRestore -h 127.0.0.1 -p $Puerto -U postgres -d restauracion --no-owner --no-privileges $Copia `
        2> $erroresRestauracion | Out-Null
    $lineasError = @(Get-Content $erroresRestauracion -ErrorAction SilentlyContinue | Where-Object { $_ -match 'error' })
    Write-Host "Errores durante la restauracion: $($lineasError.Count)"
    $lineasError | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" }

    # Comparacion: filas segun la copia vs filas realmente restauradas.
    Write-Host ''
    Write-Host ('{0,-34} {1,10} {2,10}  {3}' -f 'Tabla', 'En la copia', 'Restauradas', 'Estado')
    $entradas = & $pgRestore --list $Copia | Select-String 'TABLE DATA' | ForEach-Object {
        if ($_.Line -match 'TABLE DATA (\S+) (\S+) ') { [pscustomobject]@{ Esquema = $Matches[1]; Tabla = $Matches[2] } }
    }
    foreach ($e in $entradas) {
        $enCopia = 0; $dentro = $false
        & $pgRestore -a -n $e.Esquema -t $e.Tabla $Copia -f - 2>$null | ForEach-Object {
            if ($_ -like 'COPY *') { $dentro = $true }
            elseif ($_ -eq '\.') { $dentro = $false }
            elseif ($dentro) { $enCopia++ }
        }
        $q = 'SELECT count(*) FROM "{0}"."{1}"' -f $e.Esquema, $e.Tabla
        # PowerShell 5.1 se come las comillas dobles al llamar a un .exe; sin escaparlas, las tablas
        # con mayuscula (Usuario, Permiso) se buscarian en minuscula y parecerian no restauradas.
        $q = $q.Replace('"', '\"')
        $restauradas = (& $psql -h 127.0.0.1 -p $Puerto -U postgres -d restauracion -At -c $q 2>$null)
        $ok = ($restauradas -match '^\d+$') -and ([int]$restauradas -eq $enCopia)
        if (-not $ok) { $fallos++ }
        Write-Host ('{0,-34} {1,10} {2,10}  {3}' -f "$($e.Esquema).$($e.Tabla)", $enCopia, "$restauradas", $(if ($ok) { 'OK' } else { 'DIFERENTE' }))
    }

    Write-Host ''
    if ($fallos -eq 0) { Write-Host "RESTAURACION VERIFICADA: las $(@($entradas).Count) tablas coinciden con la copia." }
    else { Write-Host "FALLO: $fallos tabla(s) no coinciden." }
}
finally {
    if ($iniciado) { cmd /c "`"$pgCtl`" stop -D `"$datos`" -m fast > nul 2>&1" }
    if (Test-Path $carpeta) { Remove-Item $carpeta -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host 'Servidor temporal apagado y borrado.'
}

exit $(if ($fallos -eq 0) { 0 } else { 1 })
