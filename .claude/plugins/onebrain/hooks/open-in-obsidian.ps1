# OneBrain — Set Dirty Flag for Deferred Obsidian Open (Windows)
# PostToolUse hook (Write|Edit). Writes the last-edited file path to a dirty flag.

$ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
$DirtyFlag = "$env:TEMP\onebrain-dirty-$ParentPid"

$inputData = [Console]::In.ReadToEnd()
try {
    $data = $inputData | ConvertFrom-Json
    $filePath = $data.tool_input.file_path
} catch { exit 0 }

if (-not $filePath) { exit 0 }

Set-Content -Path $DirtyFlag -Value $filePath
