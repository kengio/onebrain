# OneBrain — Auto-Checkpoint Stop Hook (Windows)
# Skips if any checkpoint hook ran within 60s (COUNT=0 in existing state file).
# Config is read from vault.yml (single source of truth).

$ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
$StateFile = "$env:TEMP\onebrain-$ParentPid.state"
$SkipWindow = 60  # seconds

# Derive vault root from plugin path and read vault.yml
$VaultRoot = (Resolve-Path (Join-Path $env:CLAUDE_PLUGIN_ROOT "../../..")).Path
$VaultYml = Join-Path $VaultRoot "vault.yml"

function Get-CheckpointValue($Key, $Default) {
    if (-not (Test-Path $VaultYml)) { return $Default }
    $inBlock = $false
    foreach ($line in Get-Content $VaultYml) {
        if ($line -match '^checkpoint:') { $inBlock = $true; continue }
        if ($inBlock -and $line -match "^\s+${Key}:\s*(\d+)") { return [int]$Matches[1] }
        if ($inBlock -and $line -match '^\S') { break }
    }
    return $Default
}

$MsgThreshold = Get-CheckpointValue "messages" 15
$TimeThreshold = (Get-CheckpointValue "minutes" 30) * 60

if (Test-Path $StateFile) {
    $parts = (Get-Content $StateFile) -split ':'
    # Guard against malformed state file
    if ($parts.Count -lt 2 -or $parts[0] -notmatch '^\d+$' -or $parts[1] -notmatch '^\d+$') {
        $Count = 1  # treat as not-fresh, fall through
        $LastTs = 0
    } else {
        $Count = [int]$parts[0]
        $LastTs = [long]$parts[1]
    }
    $Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    # COUNT=0 in existing file = a hook explicitly reset after a checkpoint — skip if fresh
    if ($Count -eq 0 -and ($Now - $LastTs) -lt $SkipWindow) {
        exit 0  # another checkpoint hook just fired — skip
    }
} else {
    # First run — initialise state (COUNT=0 here is not a hook reset)
    $Count = 0
    $Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $LastTs = $Now
    Set-Content -Path $StateFile -Value "${Count}:${LastTs}"
}

$Count++
$Elapsed = $Now - $LastTs

if ($Count -ge $MsgThreshold -or $Elapsed -ge $TimeThreshold) {
    $TriggerLabel = if ($Count -ge $MsgThreshold) { "auto ($Count messages)" } else { "auto ($([math]::Floor($Elapsed / 60))m elapsed)" }
    Set-Content -Path $StateFile -Value "0:$Now"

    Write-Output "Auto-checkpoint triggered by $TriggerLabel. Silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing checkpoint-*.md files in [logs_folder]/YYYY/MM/ to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write [logs_folder]/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: auto, merged: false. (4) Content sections: '## What We Worked On' (2-3 sentences), '## Key Decisions' (bullet list), '## Action Items' (tasks with 📅 YYYY-MM-DD dates), '## Open Questions' (bullet list). Keep under 250 words total. No output to user."
} else {
    Set-Content -Path $StateFile -Value "${Count}:${LastTs}"
}
