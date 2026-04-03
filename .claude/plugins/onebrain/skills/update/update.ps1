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
    $TreeJson = Invoke-RestMethod -Uri $ApiTree -UseBasicParsing
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
        $UpstreamHash = (Get-FileHash $TmpFile    -Algorithm MD5).Hash
        $LocalHash    = (Get-FileHash $LocalPath  -Algorithm MD5).Hash

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
    $LocalDir = Join-Path $VaultRoot $Dir
    if (Test-Path $LocalDir) {
        Get-ChildItem $LocalDir -Recurse -File | ForEach-Object {
            $Rel = $_.FullName.Substring($VaultRoot.Length + 1).Replace("\", "/")
            if ($DirPaths -notcontains $Rel) {
                $Deleted.Add($Rel)
                if ($Apply) { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }
            }
        }
    }
}

# Clear plugin cache when version is unchanged (apply mode only)
$CacheNote = ""
if ($Apply) {
    $UpstreamVer = ""
    try {
        $UpstreamVer = (Invoke-RestMethod -Uri "$RawBase/.claude/plugins/onebrain/.claude-plugin/plugin.json" -UseBasicParsing).version
    } catch {}

    if ($LocalVer -and $LocalVer -eq $UpstreamVer) {
        @(
            "$env:USERPROFILE\.claude\plugins\cache\onebrain\onebrain\$LocalVer",
            "$env:USERPROFILE\.claude\plugins\cache\onebrain-local\onebrain\$LocalVer"
        ) | ForEach-Object {
            if (Test-Path $_) { Remove-Item $_ -Recurse -Force -ErrorAction SilentlyContinue }
        }
        $CacheNote = "  cache: cleared plugin cache for v$LocalVer"
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
