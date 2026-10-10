param([Parameter(Mandatory = $true)][ValidateRange(1, 1000000)][int]$AmountKrw)
$ErrorActionPreference = 'Stop'
$project = 'running-art-mobile'
$billingAccount = '01F803-1FFEFD-CA8D25'
$budgetName = 'RunPen monthly usage before credits'
$gcloud = Join-Path (Get-Location) '.tools/google-cloud-sdk/bin/gcloud.cmd'
$env:CLOUDSDK_CONFIG = Join-Path (Get-Location) '.cache/gcloud-server-compute'
$existingJson = & $gcloud billing budgets list --billing-account=$billingAccount --billing-project=$project --format=json
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing budgets' }
$matchingBudgets = @(($existingJson | ConvertFrom-Json) | Where-Object { $_.displayName -eq $budgetName })
if ($matchingBudgets.Count -gt 1) { throw 'Multiple matching budgets; inspect before editing' }
$budgetArgs = @("--billing-account=$billingAccount", "--billing-project=$project",
  "--display-name=$budgetName", "--budget-amount=${AmountKrw}KRW", '--calendar-period=month',
  '--filter-projects=projects/125644906792', '--credit-types-treatment=exclude-all-credits',
  '--threshold-rule=percent=0.5', '--threshold-rule=percent=0.9', '--threshold-rule=percent=1',
  '--threshold-rule=percent=1,basis=forecasted-spend', '--format=json')
if ($matchingBudgets.Count -eq 1) {
  & $gcloud billing budgets update $matchingBudgets[0].name @budgetArgs
} else {
  & $gcloud billing budgets create @budgetArgs
}
if ($LASTEXITCODE -ne 0) { throw 'Budget mutation failed; not confirmed' }
& $gcloud billing budgets list --billing-account=$billingAccount --billing-project=$project --format=json
if ($LASTEXITCODE -ne 0) { throw 'Budget read-back failed' }
