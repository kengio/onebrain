# qmd-reindex.ps1 — PostToolUse hook (Windows)
# Runs `qmd update` on the vault collection after Write/Edit tool use.
# Requires qmd installed and vault.yml containing a qmd_collection key.
# Always exits 0 — never blocks Claude Code.

# ── Debug logging ─────────────────────────────────────────────────────────────
$LogFile = $null
if ($env:DEBUG -eq "1") {
    $LogFile = "$env:TEMP\onebrain-qmd-debug.log"
    if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) {
        Clear-Content $LogFile
    }
}
function Write-Log {
    param([string]$Message)
    if ($LogFile) {
        $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        Add-Content -Path $LogFile -Value "[$ts] $Message"
    }
}

Write-Log "qmd-reindex.ps1 started"

# ── Check qmd is installed ─────────────────────────────────────────────────────
$qmdCmd = Get-Command qmd -ErrorAction SilentlyContinue
if (-not $qmdCmd) {
    Write-Log "qmd not found in PATH, exiting"
    exit 0
}

# ── Resolve vault root ─────────────────────────────────────────────────────────
$vaultRoot = $env:CLAUDE_PROJECT_DIR
if (-not $vaultRoot) {
    Write-Log "CLAUDE_PROJECT_DIR not set, exiting"
    exit 0
}
$vaultRoot = $vaultRoot.TrimEnd('\', '/')

# ── Read qmd_collection from vault.yml ────────────────────────────────────────
$vaultYml = Join-Path $vaultRoot "vault.yml"
if (-not (Test-Path $vaultYml)) {
    Write-Log "vault.yml not found at $vaultYml, exiting"
    exit 0
}

$collection = ""
try {
    foreach ($line in Get-Content $vaultYml -ErrorAction Stop) {
        # Match top-level key: qmd_collection: <value>
        # Strip inline YAML comments before extracting value
        if ($line -match '^qmd_collection:\s+(\S.*)') {
            $raw = $matches[1] -replace '\s*#.*$', '' # strip inline comments
            $collection = $raw.Trim().Trim('"', "'")
            break
        }
    }
} catch {
    Write-Log "Error reading vault.yml: $_"
    exit 0
}

if (-not $collection) {
    Write-Log "qmd_collection not set in vault.yml, exiting"
    exit 0
}
Write-Log "collection: $collection"

# ── Run qmd update ─────────────────────────────────────────────────────────────
Write-Log "running: qmd update -c $collection"
try {
    if ($LogFile) {
        $proc = Start-Process -FilePath "qmd" -ArgumentList "update", "-c", $collection `
            -NoNewWindow -PassThru -RedirectStandardOutput $LogFile -RedirectStandardError $LogFile
    } else {
        $proc = Start-Process -FilePath "qmd" -ArgumentList "update", "-c", $collection `
            -NoNewWindow -PassThru
    }
    Write-Log "qmd update dispatched (pid $($proc.Id))"
} catch {
    Write-Log "Failed to start qmd update: $_"
}

exit 0
