param([switch]$CreateOnly)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"
$avdName = 'RunningArt_API_36'
$avdPath = Join-Path $env:ANDROID_AVD_HOME "$avdName.avd"
if (-not (Test-Path (Join-Path $env:ANDROID_HOME 'system-images\android-36\google_apis\x86_64\package.xml'))) {
    throw 'Install the emulator image first: scripts\setup.ps1 -WithEmulator'
}
if (-not (Test-Path (Join-Path $env:ANDROID_AVD_HOME "$avdName.ini"))) {
    'no' | & avdmanager.bat create avd --name $avdName --package 'system-images;android-36;google_apis;x86_64' --device 'pixel_7' --path $avdPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Android virtual device' }
}
if ($CreateOnly) { Write-Output "Virtual device ready: $avdName"; return }
& emulator.exe -accel-check
if ($LASTEXITCODE -ne 0) {
    throw 'Enable Windows Hypervisor Platform in Windows Features and restart Windows. See README.md.'
}
& emulator.exe -avd $avdName -gpu auto -no-snapshot-load
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
