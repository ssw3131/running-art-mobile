#Requires -RunAsAdministrator
# Run explicitly from an Administrator PowerShell. This does not restart Windows.
$ErrorActionPreference = 'Stop'
Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All -NoRestart
Write-Output 'Windows Hypervisor Platform enabled. Save your work and restart Windows before starting the emulator.'
