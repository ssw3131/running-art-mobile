param(
    [ValidateSet('start', 'android', 'build', 'check', 'doctor', 'devices', 'emulator', 'web', 'prebuild', 'env')]
    [string]$Action = 'start'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scripts\env.ps1"
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path '.tools\node\npm.cmd')) {
    throw 'Run scripts\setup.ps1 first. See README.md.'
}
switch ($Action) {
    'env' { Write-Output "Node: $(node --version)"; Write-Output "Android SDK: $env:ANDROID_HOME"; return }
    'devices' { & adb.exe devices -l }
    'emulator' { & "$PSScriptRoot\scripts\emulator.ps1" }
    'build' {
        & npm.cmd run prebuild:android -- --no-install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        Push-Location android
        try { & .\gradlew.bat assembleDebug --max-workers=2 '-PreactNativeArchitectures=arm64-v8a,x86_64' }
        finally { Pop-Location }
    }
    'prebuild' { & npm.cmd run prebuild:android }
    default { & npm.cmd run $Action }
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
