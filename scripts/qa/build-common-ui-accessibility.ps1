$ErrorActionPreference='Stop'
. "$PSScriptRoot/../env.ps1"
$uiQaDir=Join-Path $projectRoot '.cache/common-ui-qa/accessibility-helper'
$uiQaTools="$env:ANDROID_HOME/build-tools/36.0.0"
$uiQaPlatform="$env:ANDROID_HOME/platforms/android-36/android.jar"
New-Item -ItemType Directory -Force "$uiQaDir/classes","$uiQaDir/dex" | Out-Null
'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.runningart.commonuiqa"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><application android:label="RunPen UI QA"/><instrumentation android:name="com.runningart.commonuiqa.CommonUiAccessibility" android:targetPackage="com.runningart.commonuiqa"/></manifest>' | Set-Content "$uiQaDir/AndroidManifest.xml" -Encoding utf8
& javac.exe -source 8 -target 8 -encoding UTF-8 -bootclasspath $uiQaPlatform -d "$uiQaDir/classes" "$PSScriptRoot/CommonUiAccessibility.java"
if($LASTEXITCODE){throw 'compile failed'}
& "$uiQaTools/d8.bat" --lib $uiQaPlatform --output "$uiQaDir/dex" "$uiQaDir/classes/com/runningart/commonuiqa/CommonUiAccessibility.class"
if($LASTEXITCODE){throw 'dex failed'}
& "$uiQaTools/aapt2.exe" link -I $uiQaPlatform --manifest "$uiQaDir/AndroidManifest.xml" -o "$uiQaDir/unsigned.apk"
if($LASTEXITCODE){throw 'package failed'}
& jar.exe uf "$uiQaDir/unsigned.apk" -C "$uiQaDir/dex" classes.dex
if($LASTEXITCODE){throw 'jar failed'}
& "$uiQaTools/zipalign.exe" -f 4 "$uiQaDir/unsigned.apk" "$uiQaDir/aligned.apk"
if($LASTEXITCODE){throw 'align failed'}
& "$uiQaTools/apksigner.bat" sign --ks "$projectRoot/android/app/debug.keystore" --ks-pass pass:android --key-pass pass:android --out "$uiQaDir/ui-accessibility.apk" "$uiQaDir/aligned.apk"
if($LASTEXITCODE){throw 'sign failed'}
