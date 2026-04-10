# OneBrain update script (PowerShell) — fetch, compare, and apply system files from GitHub.
# Run from vault root.
#
# Usage:
#   powershell -File .claude/plugins/onebrain/skills/update/update.ps1           # dry-run
#   powershell -File .claude/plugins/onebrain/skills/update/update.ps1 -Apply    # apply updates

param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

$VaultRoot  = (Get-Location).Path
$PluginDir  = Join-Path $VaultRoot ".claude/plugins/onebrain"
$Repo       = "kengio/onebrain"
$Branch     = "main"
$ApiTree    = "https://api.github.com/repos/$Repo/git/trees/${Branch}?recursive=1"
$RawBase    = "https://raw.githubusercontent.com/$Repo/$Branch"

# Verify vault install
if (-not (Test-Path $PluginDir)) {
    Write-Host "ERROR: OneBrain plugin not found at .claude/plugins/onebrain/ — run /onboarding first."
    exit 1
}

# Snapshot local version before any files are overwritten (used for cache logic later)
$LocalVer = ""
$PluginJsonPath = Join-Path $PluginDir ".claude-plugin/plugin.json"
if (Test-Path $PluginJsonPath) {
    try { $LocalVer = (Get-Content $PluginJsonPath -Raw | ConvertFrom-Json).version } catch {}
}

# Fetch upstream file tree
try {
    $TreeJson = Invoke-RestMethod -Uri $ApiTree
} catch {
    Write-Host "ERROR: Could not fetch file list from GitHub (network error or rate limit)."
    exit 1
}

# Extract all blob paths
$AllPaths = $TreeJson.tree | Where-Object { $_.type -eq "blob" } | Select-Object -ExpandProperty path
if ($null -eq $AllPaths) {
    Write-Host "ERROR: Could not parse file list from GitHub (unexpected response format)."
    exit 1
}

# Allowlist
$AllowFiles = @(".gitignore")
$AllowDirs  = @(".claude/plugins/onebrain", ".claude-plugin")

# Tracking
$Modified  = [System.Collections.Generic.List[string]]::new()
$Added     = [System.Collections.Generic.List[string]]::new()
$Unchanged = [System.Collections.Generic.List[string]]::new()
$Failed    = [System.Collections.Generic.List[string]]::new()
$Deleted   = [System.Collections.Generic.List[string]]::new()

function Compare-AndApply {
    param([string]$Path)

    $LocalPath = Join-Path $VaultRoot $Path
    $TmpFile   = [System.IO.Path]::GetTempFileName()

    try {
        Invoke-WebRequest -Uri "$RawBase/$Path" -OutFile $TmpFile -UseBasicParsing -ErrorAction Stop
    } catch {
        $Failed.Add($Path)
        Remove-Item $TmpFile -Force -ErrorAction SilentlyContinue
        return
    }

    if (-not (Test-Path $LocalPath)) {
        if ($Apply) {
            $ParentDir = Split-Path $LocalPath -Parent
            if (-not (Test-Path $ParentDir)) { New-Item -ItemType Directory -Path $ParentDir -Force | Out-Null }
            try {
                Copy-Item $TmpFile $LocalPath -Force -ErrorAction Stop
                $Added.Add($Path)
            } catch {
                $Failed.Add($Path)
            }
        } else {
            $Added.Add($Path)
        }
    } else {
        $UpstreamHash = (Get-FileHash $TmpFile    -Algorithm SHA256).Hash
        $LocalHash    = (Get-FileHash $LocalPath  -Algorithm SHA256).Hash

        if ($UpstreamHash -eq $LocalHash) {
            $Unchanged.Add($Path)
        } elseif ($Apply) {
            try {
                Copy-Item $TmpFile $LocalPath -Force -ErrorAction Stop
                $Modified.Add($Path)
            } catch {
                $Failed.Add($Path)
            }
        } else {
            $Modified.Add($Path)
        }
    }

    Remove-Item $TmpFile -Force -ErrorAction SilentlyContinue
}

# Process individual allowlisted files
foreach ($f in $AllowFiles) { Compare-AndApply $f }

# Process allowlisted directories
foreach ($Dir in $AllowDirs) {
    $DirPaths = @($AllPaths | Where-Object { $_ -like "$Dir/*" })

    foreach ($Path in $DirPaths) { Compare-AndApply $Path }

    # Find local files absent from upstream (deleted in repo)
    # Guard: skip deletion scan if $DirPaths is empty — avoids marking all local files as deleted.
    $LocalDir = Join-Path $VaultRoot $Dir
    if ($DirPaths.Count -gt 0 -and (Test-Path $LocalDir)) {
        Get-ChildItem $LocalDir -Recurse -File | Where-Object { $_.Name -ne ".gitkeep" } | ForEach-Object {
            $Rel = $_.FullName.Substring($VaultRoot.Length + 1).Replace("\", "/")
            if ($DirPaths -notcontains $Rel) {
                $Deleted.Add($Rel)
                if ($Apply) { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }
            }
        }
    }
}

# Clear stale plugin cache entries (apply mode only)
# Removes all cached versions except the current one to prevent stale hooks/skills from loading.
# Note: deleting a version loaded by the current session causes PostToolUse hook errors until
# the session is restarted — this is expected and resolves on next session start.
$CacheNote = ""
if ($Apply -and $LocalVer) {
    # Claude Code on Windows stores cache under %USERPROFILE%\.claude\ (mirrors Unix ~/.claude/)
    $ClearedSet = [System.Collections.Generic.HashSet[string]]::new()
    @(
        "$env:USERPROFILE\.claude\plugins\cache\onebrain\onebrain",
        "$env:USERPROFILE\.claude\plugins\cache\onebrain-local\onebrain"
    ) | ForEach-Object {
        if (Test-Path $_) {
            Get-ChildItem -Path $_ -Directory | Where-Object { $_.Name -ne $LocalVer } | ForEach-Object {
                Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                $null = $ClearedSet.Add($_.Name)
            }
        }
    }
    if ($ClearedSet.Count -gt 0) {
        $ClearedList = ($ClearedSet | Sort-Object) -join ', '
        $CacheNote = "  cache: cleared stale versions ($ClearedList), kept v$LocalVer — start a new Claude Code session to reload the plugin"
    }
}

# Output report
Write-Host "=== OneBrain Update Report ==="
Write-Host "mode: $(if ($Apply) { 'applied' } else { 'dry-run' })"
Write-Host "modified: $($Modified.Count)"
Write-Host "added: $($Added.Count)"
Write-Host "deleted: $($Deleted.Count)"
Write-Host "unchanged: $($Unchanged.Count)"
Write-Host "failed: $($Failed.Count)"

foreach ($f in $Modified) { Write-Host "  ~ $f" }
foreach ($f in $Added)    { Write-Host "  + $f" }
foreach ($f in $Deleted)  { Write-Host "  - $f" }
foreach ($f in $Failed)   { Write-Host "  ! $f" }

if ($CacheNote) { Write-Host $CacheNote }

if ($Failed.Count -gt 0) {
    Write-Host "status: partial_failure"
    exit 1
}
Write-Host "status: ok"
