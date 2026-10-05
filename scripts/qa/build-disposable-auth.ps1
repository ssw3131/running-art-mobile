$ErrorActionPreference='Stop'
. "$PSScriptRoot/../env.ps1"
$qaDir=Join-Path $projectRoot '.cache/remaining-qa/auth-helper'
$qaTools="$env:ANDROID_HOME/build-tools/36.0.0"
$qaPlatform="$env:ANDROID_HOME/platforms/android-36/android.jar"
New-Item -ItemType Directory -Force "$qaDir/classes","$qaDir/dex" | Out-Null
'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.runningart.disposableauth"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><application android:label="RunPen disposable QA"/><instrumentation android:name="com.runningart.disposableauth.DisposableAuth" android:targetPackage="com.runningart.mobile.dev"/></manifest>' | Set-Content "$qaDir/AndroidManifest.xml" -Encoding utf8
& javac.exe -source 8 -target 8 -encoding UTF-8 -bootclasspath $qaPlatform -d "$qaDir/classes" "$PSScriptRoot/DisposableAuth.java"
if($LASTEXITCODE){throw 'compile failed'}
& "$qaTools/d8.bat" --lib $qaPlatform --output "$qaDir/dex" "$qaDir/classes/com/runningart/disposableauth/DisposableAuth.class"
if($LASTEXITCODE){throw 'dex failed'}
& "$qaTools/aapt2.exe" link -I $qaPlatform --manifest "$qaDir/AndroidManifest.xml" -o "$qaDir/unsigned.apk"
if($LASTEXITCODE){throw 'package failed'}
& jar.exe uf "$qaDir/unsigned.apk" -C "$qaDir/dex" classes.dex
if($LASTEXITCODE){throw 'jar failed'}
& "$qaTools/zipalign.exe" -f 4 "$qaDir/unsigned.apk" "$qaDir/aligned.apk"
if($LASTEXITCODE){throw 'align failed'}
& "$qaTools/apksigner.bat" sign --ks "$projectRoot/android/app/debug.keystore" --ks-pass pass:android --key-pass pass:android --out "$qaDir/disposable-auth.apk" "$qaDir/aligned.apk"
if($LASTEXITCODE){throw 'sign failed'}
