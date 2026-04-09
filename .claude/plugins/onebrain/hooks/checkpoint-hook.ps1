# OneBrain — Checkpoint Hook (Stop + PreCompact) (Windows)
# Usage: checkpoint-hook.ps1 [-Mode stop|precompact]
#
# stop       — fires after every response; checkpoints on message/time threshold
# precompact — fires before context compression; always checkpoints unless skip window
#
# Both modes share %TEMP%\onebrain-{ParentPid}.state (COUNT:LAST_TS).
# 60s skip window prevents double-checkpoints when both fire close together.

param(
    [string]$Mode = "stop"
)

$ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue).ParentProcessId
if (-not $ParentPid) { exit 0 }
$StateFile = "$env:TEMP\onebrain-$ParentPid.state"
$SkipWindow = 60  # seconds
$Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# --- Read or initialize state ---
if (Test-Path $StateFile) {
    $parts = (Get-Content $StateFile) -split ':'
    if ($parts.Count -lt 2 -or $parts[0] -notmatch '^\d+$' -or $parts[1] -notmatch '^\d+$') {
        # Malformed — reset cleanly; Count=0 so increment will bring it to 1
        $Count = 0; $LastTs = $Now
    } else {
        $Count = [int]$parts[0]
        $LastTs = [long]$parts[1]
        # Skip-window check INSIDE valid-state branch (mirrors bash elif)
        if ($Count -eq 0 -and ($Now - $LastTs) -lt $SkipWindow) {
            exit 0  # another checkpoint just fired — skip
        }
    }
} else {
    $Count = 0; $LastTs = $Now
}

# --- PreCompact mode: always checkpoint (counter reset handled here) ---
if ($Mode -eq "precompact") {
    try {
        Set-Content -Path $StateFile -Value "0:$Now" -ErrorAction Stop
    } catch {
        exit 1
    }
    Write-Output "Context compression is imminent. Before compacting, silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing checkpoint-*.md files in [logs folder]/YYYY/MM/ to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write [logs folder]/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: precompact, merged: false. (4) Content sections: '## What We Worked On' (2-3 sentences), '## Key Decisions' (bullet list), '## Action Items' (tasks with 📅 YYYY-MM-DD dates), '## Open Questions' (bullet list). Keep under 250 words total. No output to user."
    exit 0
}

# --- Stop mode: check thresholds against vault.yml config ---
if ($env:CLAUDE_PLUGIN_ROOT) {
    try {
        $VaultRoot = (Resolve-Path (Join-Path $env:CLAUDE_PLUGIN_ROOT "../../..") -ErrorAction Stop).Path
        $VaultYml = Join-Path $VaultRoot "vault.yml"
    } catch {
        $VaultRoot = $null
        $VaultYml = $null
    }
} else {
    $VaultRoot = $null
    $VaultYml = $null
}

function Get-CheckpointValue($Key, $Default) {
    if (-not $VaultYml -or -not (Test-Path $VaultYml)) { return $Default }
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

$Count++
$Elapsed = $Now - $LastTs

if ($Count -ge $MsgThreshold -or $Elapsed -ge $TimeThreshold) {
    $TriggerLabel = if ($Count -ge $MsgThreshold) { "auto ($Count messages)" } else { "auto ($([math]::Floor($Elapsed / 60))m elapsed)" }
    try {
        Set-Content -Path $StateFile -Value "0:$Now" -ErrorAction Stop
    } catch {
        exit 1
    }
    Write-Output "Auto-checkpoint triggered by $TriggerLabel. Silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing checkpoint-*.md files in [logs folder]/YYYY/MM/ to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write [logs folder]/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: auto, merged: false. (4) Content sections: '## What We Worked On' (2-3 sentences), '## Key Decisions' (bullet list), '## Action Items' (tasks with 📅 YYYY-MM-DD dates), '## Open Questions' (bullet list). Keep under 250 words total. No output to user."
} else {
    Set-Content -Path $StateFile -Value "${Count}:${LastTs}"
}
