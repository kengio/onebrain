# open-in-obsidian.ps1 — PostToolUse hook (Windows PowerShell)
# Opens a vault file in Obsidian after Write/Edit tool use.
# Scoped to content folders only. Enforces vault boundary.
# No external dependencies — PowerShell built-ins only.

$ErrorActionPreference = "SilentlyContinue"

# ── Debug logging ─────────────────────────────────────────────────────────────
$debugLog = $null
if ($env:DEBUG -eq "1") {
    $debugLog = Join-Path $env:TEMP "onebrain-hook-debug.log"
    Add-Content -Encoding UTF8 $debugLog "[$([datetime]::Now.ToString('o'))] open-in-obsidian.ps1 started"
}
function Write-Log($msg) {
    if ($debugLog) { Add-Content -Encoding UTF8 $debugLog "[$([datetime]::Now.ToString('o'))] $msg" }
}

# ── Read stdin ────────────────────────────────────────────────────────────────
# Collect into $json directly — do NOT reassign $input (it's a PowerShell automatic variable)
try {
    $json = $input | ConvertFrom-Json
} catch {
    Write-Log "JSON parse failed, exiting"
    exit 0
}
if (-not $json) { exit 0 }

# ── Extract file_path ─────────────────────────────────────────────────────────
$filePath = $json.tool_input.file_path
if (-not $filePath) {
    Write-Log "file_path empty or missing, exiting"
    exit 0
}
Write-Log "file_path: $filePath"

# ── Resolve absolute path ──────────────────────────────────────────────────────
# Claude Code always provides absolute paths — use directly if already absolute.
# GetFullPath handles the rare relative-path case; note CLR cwd may differ from PS $PWD.
if ([System.IO.Path]::IsPathRooted($filePath)) {
    $absPath = $filePath
} else {
    $absPath = [System.IO.Path]::GetFullPath($filePath)
}
Write-Log "abs_path: $absPath"

# ── Vault boundary check ───────────────────────────────────────────────────────
$vaultRoot = $env:CLAUDE_PROJECT_DIR
if (-not $vaultRoot) {
    Write-Log "CLAUDE_PROJECT_DIR not set, exiting"
    exit 0
}
$vaultRoot = $vaultRoot.TrimEnd('\').TrimEnd('/')

if (-not $absPath.StartsWith($vaultRoot + '\') -and -not $absPath.StartsWith($vaultRoot + '/')) {
    Write-Log "file outside vault, exiting"
    exit 0
}

# ── Read content folders from vault.yml ───────────────────────────────────────
function Get-ContentFolders($vaultRootPath) {
    $defaults = @("00-inbox","01-projects","02-areas","03-knowledge","04-resources")
    $yml = Join-Path $vaultRootPath "vault.yml"
    if (-not (Test-Path $yml)) { return $defaults }
    # $keys and $defaults must stay in sync — same order, same length
    $keys = @("inbox","projects","areas","knowledge","resources")
    $folders = @{}
    $inFolders = $false
    foreach ($line in Get-Content $yml) {
        if ($inFolders -and $line -match "^\S" -and $line.Trim() -ne "folders:") { break }
        if ($line.Trim() -eq "folders:") { $inFolders = $true; continue }
        if ($inFolders -and $line -match "^\s+(\w+):\s*(.+)") {
            $folders[$Matches[1]] = $Matches[2].Trim()
        }
    }
    return ($keys | ForEach-Object {
        if ($folders[$_]) { $folders[$_] }
        else { $defaults[[Array]::IndexOf($keys, $_)] }
    })
}

$contentFolders = Get-ContentFolders $vaultRoot
Write-Log "content folders: $($contentFolders -join '|')"

# ── Content folder filter ──────────────────────────────────────────────────────
$matched = $false
foreach ($folder in $contentFolders) {
    $folderPath = Join-Path $vaultRoot $folder
    if ($absPath.StartsWith($folderPath + '\') -or $absPath.StartsWith($folderPath + '/') -or $absPath -eq $folderPath) {
        $matched = $true
        break
    }
}

if (-not $matched) {
    Write-Log "file not in content folder, exiting"
    exit 0
}

# ── URL-encode path ────────────────────────────────────────────────────────────
# EscapeDataString encodes all characters including / and : which we need preserved
# Use a manual approach: encode only unsafe chars, preserve path separators
$encoded = [Uri]::EscapeDataString($absPath) -replace '%2F','/' -replace '%3A',':'  -replace '%5C','/'
$uri = "obsidian://open?path=$encoded"
Write-Log "opening URI: $uri"

# ── Open in Obsidian ──────────────────────────────────────────────────────────
Start-Process "$uri"
Write-Log "done"
exit 0
