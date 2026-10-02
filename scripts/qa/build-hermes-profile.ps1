$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\env.ps1"
$probeOutput = Join-Path $projectRoot '.cache\hermes-gangnam\probe'
$probeSource = Join-Path $PSScriptRoot 'hermes-profile'
$probePlatform = Join-Path $env:ANDROID_HOME 'platforms\android-36\android.jar'
$probeTools = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0'
New-Item -ItemType Directory -Force -Path "$probeOutput\classes", "$probeOutput\dex" | Out-Null
& javac.exe -source 8 -target 8 -encoding UTF-8 -bootclasspath $probePlatform -d "$probeOutput\classes" "$probeSource\ProfileInstrumentation.java"
if ($LASTEXITCODE) { throw 'Profiler compile failed' }
& "$probeTools\d8.bat" --lib $probePlatform --output "$probeOutput\dex" "$probeOutput\classes\com\runningart\hermesprobe\ProfileInstrumentation.class"
if ($LASTEXITCODE) { throw 'Profiler dex failed' }
& "$probeTools\aapt2.exe" link -I $probePlatform --manifest "$probeSource\AndroidManifest.xml" -o "$probeOutput\unsigned.apk"
if ($LASTEXITCODE) { throw 'Profiler package failed' }
& jar.exe uf "$probeOutput\unsigned.apk" -C "$probeOutput\dex" classes.dex
if ($LASTEXITCODE) { throw 'Profiler dex packaging failed' }
& "$probeTools\zipalign.exe" -f 4 "$probeOutput\unsigned.apk" "$probeOutput\aligned.apk"
if ($LASTEXITCODE) { throw 'Profiler alignment failed' }
& "$probeTools\apksigner.bat" sign --ks "$projectRoot\android\app\debug.keystore" --ks-pass pass:android --key-pass pass:android --out "$probeOutput\probe.apk" "$probeOutput\aligned.apk"
if ($LASTEXITCODE) { throw 'Profiler signing failed' }
Write-Output "$probeOutput\probe.apk"
