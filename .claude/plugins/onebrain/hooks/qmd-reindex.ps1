# qmd-reindex.ps1 — PostToolUse hook (Windows)
# Runs `qmd update` on the vault collection after Write/Edit tool use.
# Requires qmd installed and vault.yml containing a qmd_collection key.
# Always exits 0 — never blocks Claude Code.

$ErrorActionPreference = "SilentlyContinue"

# Check qmd is installed
if (-not (Get-Command qmd -ErrorAction SilentlyContinue)) {
    exit 0
}

# Resolve vault root
$vaultRoot = $env:CLAUDE_PROJECT_DIR
if (-not $vaultRoot) {
    exit 0
}
$vaultRoot = $vaultRoot.TrimEnd('\', '/')

# Read qmd_collection from vault.yml
$vaultYml = Join-Path $vaultRoot "vault.yml"
if (-not (Test-Path $vaultYml)) {
    exit 0
}

$collection = ""
foreach ($line in Get-Content $vaultYml) {
    if ($line -match '^qmd_collection:\s+(\S+)') {
        $collection = $matches[1].Trim('"', "'")
        break
    }
}

if (-not $collection) {
    exit 0
}

# Run qmd update in background
Start-Process -FilePath "qmd" -ArgumentList "update", "-c", $collection -NoNewWindow -PassThru | Out-Null

exit 0
