$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$spec = (Get-Content -Raw (Join-Path $PSScriptRoot 'toolchain.json') | ConvertFrom-Json).ninja
$target = Join-Path $projectRoot '.tools\android-sdk\cmake\3.22.1\bin\ninja.exe'
if (-not (Test-Path -LiteralPath $target)) { throw 'Install Android CMake 3.22.1 first with scripts/setup.ps1.' }
$installed = & $target --version
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the installed Ninja version.' }
if ($installed.Trim() -eq $spec.version) {
    Write-Output "Ninja $($spec.version) is already configured."
    return
}

# SDK CMake 3.22.1 ships Ninja 1.10.2, which rejects long React Native header paths.
$archive = Join-Path $projectRoot ".cache\ninja-win-$($spec.version).zip"
$staging = Join-Path $projectRoot ".cache\ninja-$($spec.version)"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $archive) | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -Uri $spec.url -OutFile $archive -UseBasicParsing
}
if ((Get-FileHash -LiteralPath $archive -Algorithm $spec.algorithm).Hash -ne $spec.checksum) {
    throw "Checksum mismatch: $archive. Remove this archive and retry."
}
Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force
$replacement = Join-Path $staging 'ninja.exe'
$replacementVersion = & $replacement --version
if ($LASTEXITCODE -ne 0 -or $replacementVersion.Trim() -ne $spec.version) { throw 'Unexpected Ninja binary version.' }
$backupDirectory = Join-Path $projectRoot '.cache\tool-backups'
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$backup = Join-Path $backupDirectory ("ninja-{0}-{1}.exe" -f $installed.Trim(), (Get-Date -Format 'yyyyMMdd-HHmmssfff'))
Copy-Item -LiteralPath $target -Destination $backup
Copy-Item -LiteralPath $replacement -Destination $target -Force
if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $replacement).Hash) { throw 'Ninja copy verification failed.' }
Write-Output "Configured Ninja $($spec.version). Previous binary: $backup"
