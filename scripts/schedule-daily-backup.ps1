param(
  [string]$Time = '02:00'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = 'FormulaVest - Backup Diario'
$backupScript = Join-Path $PSScriptRoot 'run-backup.ps1'
$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backupScript"

& schtasks.exe /Create /F /SC DAILY /ST $Time /TN $taskName /TR $action | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Não foi possível criar a tarefa agendada (código $LASTEXITCODE)." }
Write-Host "Tarefa '$taskName' criada para $Time."
