$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$tools = Get-Content -LiteralPath "$PSScriptRoot\toolchain.json" -Raw | ConvertFrom-Json
function Install-PreviewArchive($Spec, [string]$Destination, [string]$Executable, [string]$Name) {
    if (Test-Path -LiteralPath (Join-Path $Destination $Executable)) { return }
    $archive = Join-Path $projectRoot ".cache\downloads\$Name.zip"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $archive),$Destination | Out-Null
    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $Spec.url -OutFile $archive }
    if ((Get-FileHash -LiteralPath $archive -Algorithm $Spec.algorithm).Hash -ne $Spec.checksum) { throw "Checksum mismatch: $archive. Preserve the failed file and investigate." }
    & tar.exe -xf $archive -C $Destination --strip-components=1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $Destination $Executable))) { throw "Extraction failed: $Name" }
}
Install-PreviewArchive $tools.node (Join-Path $projectRoot '.tools\node') 'node.exe' 'preview-node'
Install-PreviewArchive $tools.platformToolsWindows (Join-Path $projectRoot '.tools\android-sdk\platform-tools') 'adb.exe' 'preview-platform-tools'
. "$PSScriptRoot\preview-env.ps1"
if ((& node.exe --version).Trim() -ne "v$($tools.node.version)") { throw 'Unexpected Node version; do not silently replace existing tools.' }
Push-Location $projectRoot
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    & adb.exe version
    if ($LASTEXITCODE -ne 0) { throw 'ADB could not start' }
} finally { Pop-Location }
Write-Output 'Preview setup ready. Use preview.ps1 Start; USB forwarding: preview.ps1 Connect -Serial DEVICE.'
