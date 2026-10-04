$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../env.ps1"
$drawingQaRoot = Join-Path $projectRoot '.cache/custom-drawing-qa'
$drawingQaPlatform = Join-Path $env:ANDROID_HOME 'platforms/android-36'
New-Item -ItemType Directory -Force -Path "$drawingQaRoot/classes", "$drawingQaRoot/dex" | Out-Null
& javac.exe -source 8 -target 8 -cp "$drawingQaPlatform/android.jar;$drawingQaPlatform/uiautomator.jar;$drawingQaPlatform/optional/android.test.base.jar" -d "$drawingQaRoot/classes" "$PSScriptRoot/DrawingGesture.java"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$env:ANDROID_HOME/build-tools/36.0.0/d8.bat" --lib "$drawingQaPlatform/android.jar" --classpath "$drawingQaPlatform/uiautomator.jar" --output "$drawingQaRoot/dex" "$drawingQaRoot/classes/DrawingGesture.class"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& jar.exe cf "$drawingQaRoot/drawing-gesture.jar" -C "$drawingQaRoot/dex" classes.dex
exit $LASTEXITCODE
