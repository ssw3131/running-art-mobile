$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\env.ps1"
$qaRoot = Join-Path $projectRoot '.cache/running-qa'
New-Item -ItemType Directory -Force -Path "$qaRoot/ui-classes", "$qaRoot/ui-dex" | Out-Null
$qaPlatform = Join-Path $env:ANDROID_HOME 'platforms/android-36'
& javac.exe -source 8 -target 8 -cp "$qaPlatform/android.jar;$qaPlatform/uiautomator.jar;$qaPlatform/optional/android.test.base.jar" -d "$qaRoot/ui-classes" "$PSScriptRoot/RunningUiDump.java"
if ($LASTEXITCODE -ne 0) { throw 'UI helper compile failed' }
& "$env:ANDROID_HOME/build-tools/36.0.0/d8.bat" --lib "$qaPlatform/android.jar" --classpath "$qaPlatform/uiautomator.jar" --output "$qaRoot/ui-dex" "$qaRoot/ui-classes/RunningUiDump.class"
if ($LASTEXITCODE -ne 0) { throw 'UI helper dex failed' }
& jar.exe cf "$qaRoot/ui-dump.jar" -C "$qaRoot/ui-dex" classes.dex
if ($LASTEXITCODE -ne 0) { throw 'UI helper packaging failed' }
Write-Output "$qaRoot/ui-dump.jar"
