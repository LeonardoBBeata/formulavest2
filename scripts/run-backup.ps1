$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
& node (Join-Path $PSScriptRoot 'backup-db.js')
exit $LASTEXITCODE
