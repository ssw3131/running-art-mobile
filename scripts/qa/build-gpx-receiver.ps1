$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\env.ps1"
$gpxProject = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$gpxOutput = Join-Path $gpxProject '.cache\gpx-qa\receiver'
$gpxSource = Join-Path $PSScriptRoot 'gpx-receiver'
$gpxPlatform = Join-Path $env:ANDROID_HOME 'platforms\android-36\android.jar'
$gpxBuildTools = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0'
New-Item -ItemType Directory -Force -Path "$gpxOutput\classes", "$gpxOutput\dex" | Out-Null
& "$env:JAVA_HOME\bin\javac.exe" -source 8 -target 8 -encoding UTF-8 -bootclasspath $gpxPlatform -d "$gpxOutput\classes" "$gpxSource\ReceiverActivity.java"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$gpxBuildTools\d8.bat" --lib $gpxPlatform --output "$gpxOutput\dex" "$gpxOutput\classes\com\runningart\gpxreceiver\ReceiverActivity.class"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$gpxBuildTools\aapt2.exe" link -I $gpxPlatform --manifest "$gpxSource\AndroidManifest.xml" -o "$gpxOutput\unsigned.apk"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$env:JAVA_HOME\bin\jar.exe" uf "$gpxOutput\unsigned.apk" -C "$gpxOutput\dex" classes.dex
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$gpxBuildTools\zipalign.exe" -f 4 "$gpxOutput\unsigned.apk" "$gpxOutput\aligned.apk"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$gpxBuildTools\apksigner.bat" sign --ks "$gpxProject\android\app\debug.keystore" --ks-pass pass:android --key-pass pass:android --out "$gpxOutput\receiver.apk" "$gpxOutput\aligned.apk"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Write-Output $gpxOutput
