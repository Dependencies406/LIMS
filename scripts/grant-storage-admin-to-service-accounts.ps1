# PowerShell script to grant Storage Admin role to all service accounts
# Run this in PowerShell: .\scripts\grant-storage-admin-to-service-accounts.ps1

$PROJECT_ID = "scs-lims"
$ROLE = "roles/storage.admin"

Write-Host "Granting Storage Admin role to all service accounts in project: $PROJECT_ID" -ForegroundColor Cyan
Write-Host ""

# List all service accounts
$serviceAccounts = gcloud iam service-accounts list --project=$PROJECT_ID --format="value(email)" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Could not list service accounts. Make sure gcloud CLI is installed and you're authenticated." -ForegroundColor Red
    Write-Host "Install gcloud CLI: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

if ([string]::IsNullOrEmpty($serviceAccounts)) {
    Write-Host "No service accounts found in project $PROJECT_ID" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found service accounts:" -ForegroundColor Green
$serviceAccounts | ForEach-Object { Write-Host "  - $_" }
Write-Host ""

# Grant Storage Admin role to each service account
foreach ($saEmail in $serviceAccounts) {
    Write-Host "Granting Storage Admin role to: $saEmail" -ForegroundColor Cyan
    
    gcloud projects add-iam-policy-binding $PROJECT_ID `
        --member="serviceAccount:$saEmail" `
        --role=$ROLE `
        --condition=None
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully granted Storage Admin to $saEmail" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to grant Storage Admin to $saEmail" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "Done! All service accounts have been granted Storage Admin role." -ForegroundColor Green
Write-Host "Wait 2-3 minutes for permissions to propagate, then test your upload." -ForegroundColor Yellow
