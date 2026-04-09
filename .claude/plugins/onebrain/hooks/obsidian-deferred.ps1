# OneBrain — Deferred Obsidian Open (Stop Hook, Windows)
# Reads all paths appended by open-in-obsidian.ps1, opens each in Obsidian, clears flag.

$ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
$DirtyFlag = "$env:TEMP\onebrain-dirty-$ParentPid"

if (-not (Test-Path $DirtyFlag)) { exit 0 }

# Read all paths then immediately clear the flag
$paths = Get-Content $DirtyFlag
Remove-Item $DirtyFlag -Force

if (-not $paths) { exit 0 }

$seen = @{}
foreach ($filePath in $paths) {
    $filePath = $filePath.Trim()
    if (-not $filePath) { continue }
    if ($seen[$filePath]) { continue }
    $seen[$filePath] = $true

    $encoded = [Uri]::EscapeUriString($filePath.Replace('\', '/'))
    Start-Process "obsidian://open?path=$encoded"
}
