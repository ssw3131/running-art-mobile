$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $projectRoot '.tools\node'
$env:ANDROID_HOME = Join-Path $projectRoot '.tools\android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:npm_config_cache = Join-Path $projectRoot '.cache\npm'
$env:PATH = "$nodeDir;$(Join-Path $env:ANDROID_HOME 'platform-tools');$env:PATH"
