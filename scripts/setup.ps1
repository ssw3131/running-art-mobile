param([switch]$WithEmulator)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolchain = Get-Content -Raw "$PSScriptRoot\toolchain.json" | ConvertFrom-Json

function Install-Archive($Spec, [string]$Destination, [string]$Executable, [string]$CacheName) {
    if (Test-Path -LiteralPath (Join-Path $Destination $Executable)) { return }
    $archive = Join-Path $projectRoot ".cache\$CacheName.zip"
    New-Item -ItemType Directory -Force (Split-Path -Parent $archive) | Out-Null
    if (-not (Test-Path -LiteralPath $archive)) {
        Write-Output "Downloading $CacheName $($Spec.version)..."
        Invoke-WebRequest -Uri $Spec.url -OutFile $archive
    }
    $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm $Spec.algorithm).Hash
    if ($actualHash -ne $Spec.checksum) { throw "Checksum mismatch: $archive. Remove this archive and retry." }
    New-Item -ItemType Directory -Force $Destination | Out-Null
    & tar.exe -xf $archive -C $Destination --strip-components=1
    if ($LASTEXITCODE -ne 0) { throw "Extraction failed: $archive" }
}

Install-Archive $toolchain.node (Join-Path $projectRoot '.tools\node') 'node.exe' 'node-v24.21.0-win-x64'
Install-Archive $toolchain.java (Join-Path $projectRoot '.tools\java') 'bin\java.exe' 'jdk'
Install-Archive $toolchain.androidCommandLine (Join-Path $projectRoot '.tools\android-sdk\cmdline-tools\19.0') 'bin\sdkmanager.bat' 'android-commandline-19'
. "$PSScriptRoot\env.ps1"
Push-Location $projectRoot
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    $packages = @('platform-tools', 'platforms;android-36', 'build-tools;36.0.0', 'ndk;27.1.12297006', 'cmake;3.22.1')
    if ($WithEmulator) { $packages += @('emulator', 'system-images;android-36;google_apis;x86_64') }
    & sdkmanager.bat "--sdk_root=$env:ANDROID_HOME" @packages
    if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed' }
    $requiredFiles = @(
        'platform-tools\adb.exe',
        'platforms\android-36\android.jar',
        'build-tools\36.0.0\aapt2.exe',
        'ndk\27.1.12297006\ndk-build.cmd',
        'cmake\3.22.1\bin\cmake.exe'
    )
    if ($WithEmulator) {
        $requiredFiles += @('emulator\emulator.exe', 'system-images\android-36\google_apis\x86_64\system.img')
    }
    foreach ($requiredFile in $requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME $requiredFile))) {
            throw "Android component missing: $requiredFile. Check the SDK license prompt and rerun setup."
        }
    }
    & "$PSScriptRoot\repair-ninja.ps1"
    Write-Output 'Setup complete. Run powershell -ExecutionPolicy Bypass -File .\dev.ps1 check'
}
finally { Pop-Location }
