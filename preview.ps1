param(
    [Parameter(Mandatory=$true)][ValidateSet('Setup','Sync','Start','Devices','Connect','Check')][string]$Action,
    [string]$Branch,
    [string]$Serial
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scripts\preview-env.ps1"
function Git-Checked([string[]]$Arguments) {
    $result = & git @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git command failed: $($Arguments[0])" }
    return $result
}
Push-Location $PSScriptRoot
try {
    switch ($Action) {
        'Setup' { & "$PSScriptRoot\scripts\setup-preview.ps1" }
        'Sync' {
            if (-not $Branch -or $Branch.StartsWith('-')) { throw 'Specify -Branch main or the cloud work branch.' }
            $null = Git-Checked @('check-ref-format',"refs/heads/$Branch")
            if (Git-Checked @('status','--porcelain=v1','--untracked-files=normal')) { throw 'Local changes exist. Preserve them before syncing; nothing was reset.' }
            $oldLock = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
            $null = Git-Checked @('fetch','--no-tags','origin',('refs/heads/' + $Branch + ':refs/remotes/origin/' + $Branch))
            & git show-ref --verify --quiet "refs/heads/$Branch"
            $localExists = $LASTEXITCODE -eq 0
            if ($localExists) {
                & git merge-base --is-ancestor "refs/heads/$Branch" "refs/remotes/origin/$Branch"
                if ($LASTEXITCODE -ne 0) { throw 'Local branch is ahead or diverged. Preserve its commits; sync stopped.' }
                $null = Git-Checked @('switch',$Branch)
            } else { $null = Git-Checked @('switch','--track','-c',$Branch,"origin/$Branch") }
            $null = Git-Checked @('merge','--ff-only',"refs/remotes/origin/$Branch")
            $newLock = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
            if ($oldLock -ne $newLock -or -not (Test-Path -LiteralPath 'node_modules')) {
                & npm.cmd ci
                if ($LASTEXITCODE -ne 0) { throw 'Source synced, dependency installation failed. Retry Setup before Start.' }
            }
            & node.exe scripts/native-fingerprint.mjs
            if ($LASTEXITCODE -ne 0) { throw 'Native fingerprint failed' }
            Write-Output 'Compare this fingerprint with the installed development APK metadata. Native changes require a new APK.'
        }
        'Start' { & npm.cmd run start -- --localhost; if ($LASTEXITCODE -ne 0) { throw 'Metro failed' } }
        'Check' { & npm.cmd run check; if ($LASTEXITCODE -ne 0) { throw 'Source checks failed' } }
        'Devices' { & adb.exe devices -l; if ($LASTEXITCODE -ne 0) { throw 'ADB failed' } }
        'Connect' {
            if (-not $Serial -or $Serial.StartsWith('-')) { throw 'Specify the intended device with -Serial.' }
            $state = & adb.exe -s $Serial get-state
            if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne 'device') { throw 'Device is not connected and authorized.' }
            & adb.exe -s $Serial reverse tcp:8081 tcp:8081
            if ($LASTEXITCODE -ne 0) { throw 'USB port forwarding failed' }
        }
    }
} finally { Pop-Location }
