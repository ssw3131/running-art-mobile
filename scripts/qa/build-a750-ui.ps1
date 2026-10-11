$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../env.ps1"
$a750QaRoot = Join-Path $projectRoot '.cache/a750-qa-tools'
$a750QaPlatform = Join-Path $env:ANDROID_HOME 'platforms/android-36'
New-Item -ItemType Directory -Force -Path "$a750QaRoot/classes", "$a750QaRoot/dex" | Out-Null
& javac.exe -source 8 -target 8 -cp "$a750QaPlatform/android.jar;$a750QaPlatform/uiautomator.jar;$a750QaPlatform/optional/android.test.base.jar" -d "$a750QaRoot/classes" "$PSScriptRoot/PerformanceUiDump.java" "$PSScriptRoot/DrawingGesture.java"
if ($LASTEXITCODE) { throw 'A750 UI helper compile failed' }
& "$env:ANDROID_HOME/build-tools/36.0.0/d8.bat" --lib "$a750QaPlatform/android.jar" --classpath "$a750QaPlatform/uiautomator.jar" --output "$a750QaRoot/dex" "$a750QaRoot/classes/PerformanceUiDump.class" "$a750QaRoot/classes/DrawingGesture.class"
if ($LASTEXITCODE) { throw 'A750 UI helper dex failed' }
& jar.exe cf "$a750QaRoot/a750-ui.jar" -C "$a750QaRoot/dex" classes.dex
if ($LASTEXITCODE) { throw 'A750 UI helper packaging failed' }
Write-Output "$a750QaRoot/a750-ui.jar"
