$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = Join-Path $projectRoot '.tools\java'
$env:ANDROID_HOME = Join-Path $projectRoot '.tools\android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $projectRoot '.cache\android'
$env:ANDROID_AVD_HOME = Join-Path $env:ANDROID_USER_HOME 'avd'
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.cache\gradle'
$env:npm_config_cache = Join-Path $projectRoot '.cache\npm'
$toolPaths = @(
    (Join-Path $projectRoot '.tools\node'),
    (Join-Path $env:JAVA_HOME 'bin'),
    (Join-Path $env:ANDROID_HOME 'platform-tools'),
    (Join-Path $env:ANDROID_HOME 'emulator'),
    (Join-Path $env:ANDROID_HOME 'cmdline-tools\19.0\bin')
)
$env:PATH = ($toolPaths -join ';') + ';' + $env:PATH
foreach ($directory in @($env:ANDROID_USER_HOME, $env:ANDROID_AVD_HOME, $env:GRADLE_USER_HOME)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
$gradleSettings = Join-Path $env:GRADLE_USER_HOME 'gradle.properties'
if (-not (Test-Path -LiteralPath $gradleSettings)) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'gradle.properties') -Destination $gradleSettings
}
