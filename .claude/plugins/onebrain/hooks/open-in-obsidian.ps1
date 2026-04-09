# OneBrain — Set Dirty Flag for Deferred Obsidian Open (Windows)
# PostToolUse hook (Write|Edit). Appends each edited file path to a dirty flag.
# obsidian-deferred.ps1 (Stop hook) reads all paths and opens each in Obsidian once.

$ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
$DirtyFlag = "$env:TEMP\onebrain-dirty-$ParentPid"

$inputData = [Console]::In.ReadToEnd()
try {
    $data = $inputData | ConvertFrom-Json
    $filePath = $data.tool_input.file_path
} catch { exit 0 }

if (-not $filePath) { exit 0 }

# Append path — Stop hook collects all files written this response
Add-Content -Path $DirtyFlag -Value $filePath
