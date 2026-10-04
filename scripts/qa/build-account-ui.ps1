$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\env.ps1"
$accountQaOutput = Join-Path $projectRoot '.cache\account-phone-qa\input-helper'
$accountQaSource = Join-Path $PSScriptRoot 'account-ui'
$accountQaPlatform = Join-Path $env:ANDROID_HOME 'platforms\android-36\android.jar'
$accountQaTools = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0'
New-Item -ItemType Directory -Force -Path "$accountQaOutput\classes", "$accountQaOutput\dex" | Out-Null
& javac.exe -source 8 -target 8 -encoding UTF-8 -bootclasspath $accountQaPlatform -d "$accountQaOutput\classes" "$accountQaSource\NicknameInput.java"
if ($LASTEXITCODE) { throw 'Account UI helper compile failed' }
& "$accountQaTools\d8.bat" --lib $accountQaPlatform --output "$accountQaOutput\dex" "$accountQaOutput\classes\com\runningart\accountqa\NicknameInput.class"
if ($LASTEXITCODE) { throw 'Account UI helper dex failed' }
& "$accountQaTools\aapt2.exe" link -I $accountQaPlatform --manifest "$accountQaSource\AndroidManifest.xml" -o "$accountQaOutput\unsigned.apk"
if ($LASTEXITCODE) { throw 'Account UI helper package failed' }
& jar.exe uf "$accountQaOutput\unsigned.apk" -C "$accountQaOutput\dex" classes.dex
if ($LASTEXITCODE) { throw 'Account UI helper dex packaging failed' }
& "$accountQaTools\zipalign.exe" -f 4 "$accountQaOutput\unsigned.apk" "$accountQaOutput\aligned.apk"
if ($LASTEXITCODE) { throw 'Account UI helper alignment failed' }
& "$accountQaTools\apksigner.bat" sign --ks "$projectRoot\android\app\debug.keystore" --ks-pass pass:android --key-pass pass:android --out "$accountQaOutput\account-ui.apk" "$accountQaOutput\aligned.apk"
if ($LASTEXITCODE) { throw 'Account UI helper signing failed' }
Write-Output "$accountQaOutput\account-ui.apk"
