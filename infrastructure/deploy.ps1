# Wrapper script to run azd up with the correct path
$azdPath = "$env:LOCALAPPDATA\Programs\Azure Dev CLI\azd.exe"

if (Test-Path $azdPath) {
    Write-Host "🚀 Starting RM AI Q deployment..."
    Write-Host "Path: $azdPath"
    Write-Host "----------------------------------------"
    Write-Host "⚠️  Follow the interactive prompts:"
    Write-Host "1. Log in to Azure (if asked)"
    Write-Host "2. Enter a valid environment name (e.g., 'rmaiq-prod')"
    Write-Host "3. Select your subscription"
    Write-Host "4. Select a location (e.g., 'eastus2')"
    Write-Host "----------------------------------------"

    & $azdPath up
} else {
    Write-Error "❌ azd.exe not found at $azdPath. Please restart VS Code to pick up the PATH change."
}
