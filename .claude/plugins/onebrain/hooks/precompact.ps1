# OneBrain — PreCompact Hook (Windows)
# Fires before context compression. Skips if auto-checkpoint just ran (within 60s)
# to prevent duplicate checkpoints. Otherwise resets counter and injects prompt.

$ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
$StateFile = "$env:TEMP\onebrain-$ParentPid.state"
$SkipWindow = 60  # seconds

if (Test-Path $StateFile) {
    $parts = (Get-Content $StateFile) -split ':'
    $Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    # Guard against malformed state file
    if ($parts.Count -lt 2 -or $parts[0] -notmatch '^\d+$' -or $parts[1] -notmatch '^\d+$') {
        $Count = 1  # treat as not-fresh, fall through to write + emit
        $LastTs = $Now
    } else {
        $Count = [int]$parts[0]
        $LastTs = [long]$parts[1]
    }
    # COUNT=0 + fresh timestamp = auto-checkpoint just reset the counter
    if ($Count -eq 0 -and ($Now - $LastTs) -lt $SkipWindow) {
        exit 0  # auto-checkpoint already captured this moment — skip
    }
    Set-Content -Path $StateFile -Value "0:$Now"
} else {
    $Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    Set-Content -Path $StateFile -Value "0:$Now"
}

# Inject checkpoint prompt
Write-Output "Context compression is imminent. Before compacting, silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing checkpoint-*.md files in [logs_folder]/YYYY/MM/ to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write [logs_folder]/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: precompact, merged: false. (4) Content sections: '## What We Worked On' (2-3 sentences), '## Key Decisions' (bullet list), '## Action Items' (tasks with 📅 YYYY-MM-DD dates), '## Open Questions' (bullet list). Keep under 250 words total. No output to user."
