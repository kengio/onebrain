# OneBrain — Deferred Obsidian Open (Stop Hook, Windows)
# Reads dirty flag written by open-in-obsidian.ps1, opens Obsidian once, clears flag.

$ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
$DirtyFlag = "$env:TEMP\onebrain-dirty-$ParentPid"

if (-not (Test-Path $DirtyFlag)) { exit 0 }

$filePath = (Get-Content $DirtyFlag -Raw).Trim()
Remove-Item $DirtyFlag -Force

if (-not $filePath) { exit 0 }

$encoded = [Uri]::EscapeDataString($filePath)
Start-Process "obsidian://open?path=$encoded"
