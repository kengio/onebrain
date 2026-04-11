# OneBrain — Checkpoint Hook (Stop) (Windows)
# Usage: checkpoint-hook.ps1 [-Mode stop]
#
# stop — fires after every response; checkpoints on message/time threshold
#         Uses JSON {"decision":"block","reason":"..."} to inject prompt back to Claude.
#
# State file: %TEMP%\onebrain-{ParentPid}.state (COUNT:LAST_TS)
# COUNT=0 with fresh timestamp in an *existing* state file signals post-checkpoint reset;
# absence of state file = first run.
# SkipWindow=60: prevents re-trigger immediately after a checkpoint resets Count to 0.
# MIN_ACTIVITY guard: if fewer than 2 messages since last checkpoint, reset and skip —
# no file is created for sessions with no meaningful activity.

param(
    [string]$Mode = "stop"
)

if ($Mode -ne "stop") {
    Write-Error "checkpoint-hook.ps1: unknown mode '$Mode' — only 'stop' is supported"
    exit 1
}

$ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue).ParentProcessId
if (-not $ParentPid) { exit 0 }
$StateFile = "$env:TEMP\onebrain-$ParentPid.state"
$SkipWindow = 60    # seconds
$MinActivity = 2    # minimum messages since last checkpoint to warrant a new one
$Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# --- Read or initialize state ---
if (Test-Path $StateFile) {
    $parts = (Get-Content $StateFile) -split ':'
    if ($parts.Count -lt 2 -or $parts[0] -notmatch '^\d+$' -or $parts[1] -notmatch '^\d+$') {
        # Malformed — reset cleanly; Count=0 so increment will bring it to 1
        $Count = 0
        $LastTs = try { [DateTimeOffset]::new((Get-Item $StateFile).LastWriteTimeUtc).ToUnixTimeSeconds() } catch { $Now }
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

# --- Stop mode: check thresholds against vault.yml config ---
# CLAUDE_PLUGIN_ROOT is set when called from plugin hooks.json; absent from settings.json.
# hooks/ is one level deeper than plugin root, so fallback goes up 4 levels from script path.
if ($env:CLAUDE_PLUGIN_ROOT) {
    try {
        $VaultRoot = (Resolve-Path (Join-Path $env:CLAUDE_PLUGIN_ROOT "../../..") -ErrorAction Stop).Path
        $VaultYml = Join-Path $VaultRoot "vault.yml"
    } catch {
        $VaultRoot = $null
        $VaultYml = $null
    }
} else {
    # Fallback: derive from script path (used when called from settings.json)
    # $PSScriptRoot is the reliable automatic variable for this — always set when running a .ps1 file
    try {
        $VaultRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../..") -ErrorAction Stop).Path
        $VaultYml = Join-Path $VaultRoot "vault.yml"
    } catch {
        $VaultRoot = $null
        $VaultYml = $null
    }
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
    if ($Count -lt $MinActivity) {
        # Threshold fired on time but not enough activity — reset and wait next round
        Set-Content -Path $StateFile -Value "0:$Now" -ErrorAction SilentlyContinue
        exit 0
    }
    $TriggerLabel = if ($Count -ge $MsgThreshold) { "auto ($Count messages)" } else { "auto ($([math]::Floor($Elapsed / 60))m elapsed)" }
    $Prompt = "Auto-checkpoint triggered by $TriggerLabel. Silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing YYYY-MM-DD-checkpoint-*.md files in [logs folder]/YYYY/MM/ (using today's actual date in the filename pattern) to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write [logs folder]/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: auto, merged: false. (4) Content sections: ## What We Worked On (2-3 sentences), ## Key Decisions (bullet list), ## Action Items (tasks with date YYYY-MM-DD), ## Open Questions (bullet list). Keep under 250 words total. No output to user."
    # Build JSON before writing state — leave state unchanged on failure
    $Json = try { ConvertTo-Json @{decision = 'block'; reason = $Prompt} -Compress } catch { $null }
    if (-not $Json) { exit 1 }
    try {
        Set-Content -Path $StateFile -Value "0:$Now" -ErrorAction Stop
    } catch {
        exit 2
    }
    Write-Output $Json
} else {
    Set-Content -Path $StateFile -Value "${Count}:${LastTs}"
}
exit 0
