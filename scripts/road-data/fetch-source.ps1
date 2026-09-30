param([string]$Destination = '.cache/road-data/raw')
$ErrorActionPreference = 'Stop'
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'source-lock.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$file = Join-Path $Destination $source.file
if (-not (Test-Path -LiteralPath $file)) {
    $partial = $file + '.part'
    & curl.exe --fail --location --connect-timeout 20 --max-time 900 --output $partial $source.url
    if ($LASTEXITCODE -ne 0) { throw 'OSM download failed; partial file retained.' }
    $hash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
    if ((Get-Item -LiteralPath $partial).Length -ne $source.bytes -or $hash -ne $source.sha256) {
        throw 'OSM source size or SHA-256 mismatch; partial file retained.'
    }
    Move-Item -LiteralPath $partial -Destination $file
}
$hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Get-Item -LiteralPath $file).Length -ne $source.bytes -or $hash -ne $source.sha256) { throw 'Existing source does not match source-lock.json.' }
Write-Output "Verified $($source.file): $hash"
