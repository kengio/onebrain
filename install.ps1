#Requires -Version 5.0
$ErrorActionPreference = 'Stop'

# Ensure TLS 1.2 is enabled — required by GitHub (PS 5 defaults to TLS 1.0 which GitHub dropped)
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# ─── Colors ───────────────────────────────────────────────────────────────────
if ($Host.UI.SupportsVirtualTerminal) {
  $script:Bold      = [char]0x1b + "[1m"
  $script:BoldReset = [char]0x1b + "[0m"
} else {
  $script:Bold = ""; $script:BoldReset = ""
}
function Print-Info    { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Print-Success { param($msg) Write-Host "  $msg" -ForegroundColor Green }
function Print-Error   { param($msg) Write-Host "  error: $msg" -ForegroundColor Red }
function Print-Header  { param($msg) Write-Host; Write-Host $msg -ForegroundColor Cyan; Write-Host }
function Write-Step    { param($emoji, $msg) Write-Host "  $emoji $msg" }
function Write-Done    { param($msg) Write-Host "  ✅ $msg" -ForegroundColor Green }

function Print-Banner {
  Write-Host
  Write-Host "  ___             ____            _       " -ForegroundColor Cyan
  Write-Host " / _ \ _ __   ___| __ ) _ __ __ _(_)_ __  " -ForegroundColor Cyan
  Write-Host "| | | | '_ \ / _ \  _ \| '__/ _`` | | '_ \ " -ForegroundColor Cyan
  Write-Host "| |_| | | | |  __/ |_) | | | (_| | | | | |" -ForegroundColor Cyan
  Write-Host " \___/|_| |_|\___|____/|_|  \__,_|_|_| |_|" -ForegroundColor Cyan
  Write-Host
  Write-Host " > Two Minds, Think as One, in OneBrain" -ForegroundColor Yellow
  Write-Host
}

# ─── Dependency check ─────────────────────────────────────────────────────────
function Check-Deps {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Print-Error "git is required but not found (or not on your PATH)."
    Write-Host
    Write-Host "  Install git:" -ForegroundColor White
    Write-Host "    • winget:      " -NoNewline; Write-Host "winget install --id Git.Git" -ForegroundColor Cyan
    Write-Host "    • Chocolatey:  " -NoNewline; Write-Host "choco install git" -ForegroundColor Cyan
    Write-Host "    • Download:    " -NoNewline; Write-Host "https://git-scm.com/download/win" -ForegroundColor Cyan
    Write-Host
    Print-Error "After installing, open a new terminal and re-run this script."
    exit 1
  }
}

# ─── Prompt helpers ───────────────────────────────────────────────────────────
function Prompt-WithDefault {
  param([string]$Number, [string]$Question, [string]$Default)
  Write-Host "  $Number) " -NoNewline -ForegroundColor Yellow
  Write-Host "$Question " -NoNewline
  Write-Host "[$Default]" -ForegroundColor Cyan
  Write-Host "  > " -NoNewline -ForegroundColor Yellow
  $answer = $host.UI.ReadLine()
  if ([string]::IsNullOrWhiteSpace($answer)) { $Default } else { $answer }
}

# ─── Plugin installer ─────────────────────────────────────────────────────────
# Install-Plugins <vaultPath>
# Downloads the latest release of each plugin listed in .obsidian/community-plugins.json.
# No external dependencies — uses only PowerShell 5+ built-in cmdlets. Does not
# require curl, jq, or additional modules.
# Non-fatal: returns a list of plugin IDs that failed (empty array on full success).
function Install-Plugins {
  param([string]$VaultPath)

  $pluginsJson = Join-Path $VaultPath ".obsidian\community-plugins.json"
  $registryUrl = "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json"
  $failedPlugins = @()

  if (-not (Test-Path $pluginsJson)) { return ,@($failedPlugins) }

  # Wrap ConvertFrom-Json in try/catch: malformed JSON (e.g. sync-conflict markers) throws
  # a terminating error and must not propagate to the outer Main catch as a fatal abort.
  try {
    $pluginIds = Get-Content $pluginsJson -Raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    Write-Host "  ⚠️  community-plugins.json could not be parsed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Skipping plugin installation." -ForegroundColor Yellow
    return ,@($failedPlugins)
  }
  # Validate that the file is a flat array of strings (guards against sync-conflict corruption)
  if (-not $pluginIds -or $pluginIds.Count -eq 0) { return ,@($failedPlugins) }
  if ($pluginIds | Where-Object { $_ -isnot [string] }) {
    Write-Host "  ⚠️  community-plugins.json is malformed (expected array of strings). Skipping plugin installation." -ForegroundColor Yellow
    return ,@($failedPlugins)
  }

  Print-Header "Installing Obsidian community plugins..."

  # Fetch Obsidian plugin registry once
  try {
    $registry = Invoke-RestMethod -Uri $registryUrl -ErrorAction Stop
  } catch {
    Write-Host "  ⚠️  Plugin registry unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  All plugins will need to be installed manually." -ForegroundColor Yellow
    return ,@($pluginIds)  # all plugins are "failed"
  }
  # Wrap New-Item in try/catch: a filesystem error here must not propagate to the outer
  # Main catch as a fatal abort — plugin installation is a non-fatal step.
  $pluginsDir = Join-Path $VaultPath ".obsidian\plugins"
  try {
    if (-not (Test-Path $pluginsDir)) {
      New-Item -ItemType Directory -Path $pluginsDir -Force -ErrorAction Stop | Out-Null
    }
  } catch {
    Write-Host "  ⚠️  Could not create plugins directory '$pluginsDir': $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  All plugins will need to be installed manually." -ForegroundColor Yellow
    return ,@($pluginIds)
  }

  # GitHub REST API: 60 req/hr unauthenticated (shared per IP) — 5,000/hr with GITHUB_TOKEN.
  # Build headers once; GITHUB_TOKEN does not change during the loop.
  $ghHeaders = @{ Accept = "application/vnd.github.v3+json" }
  if ($env:GITHUB_TOKEN) { $ghHeaders["Authorization"] = "Bearer $env:GITHUB_TOKEN" }

  foreach ($pluginId in $pluginIds) {
    # Validate plugin ID: reject IDs with path-traversal or shell-unsafe characters
    if ($pluginId -notmatch '^[a-zA-Z0-9_-]+$') {
      Write-Host "  ⚠️  skipped invalid plugin ID: '$pluginId'" -ForegroundColor Yellow
      $failedPlugins += $pluginId
      continue
    }

    # Find matching entry in the registry
    $entry = $registry | Where-Object { $_.id -eq $pluginId } | Select-Object -First 1
    if (-not $entry -or -not $entry.repo) {
      Write-Host "  ⚠️  skipped $pluginId (not found in registry)" -ForegroundColor Yellow
      $failedPlugins += $pluginId
      continue
    }
    $repo = $entry.repo

    try {
      $release = Invoke-RestMethod `
        -Uri "https://api.github.com/repos/$repo/releases/latest" `
        -Headers $ghHeaders `
        -ErrorAction Stop
      $tag = $release.tag_name
    } catch {
      # HTTP 403 can mean rate limit or access denied (private repo, bad token scope) —
      # check status code via the response object to avoid matching "403" in unrelated messages
      $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
      if ($statusCode -eq 403) {
        Write-Host "  ❌ forbidden $pluginId (HTTP 403 — rate limited or access denied; check GITHUB_TOKEN)" -ForegroundColor Red
      } else {
        Write-Host "  ❌ failed $pluginId (could not get release tag: $($_.Exception.Message))" -ForegroundColor Red
      }
      $failedPlugins += $pluginId
      continue
    }

    if (-not $tag) {
      Write-Host "  ❌ failed $pluginId (empty release tag)" -ForegroundColor Red
      $failedPlugins += $pluginId
      continue
    }

    # Wrap New-Item per-plugin in try/catch to preserve non-fatal contract
    $pluginDir = Join-Path $pluginsDir $pluginId
    try {
      New-Item -ItemType Directory -Path $pluginDir -Force -ErrorAction Stop | Out-Null
    } catch {
      Write-Host "  ❌ failed $pluginId (could not create plugin directory: $($_.Exception.Message))" -ForegroundColor Red
      $failedPlugins += $pluginId
      continue
    }

    $baseUrl = "https://github.com/$repo/releases/download/$tag"
    $ok = $true

    # main.js and manifest.json are required; short-circuit on first failure.
    # After download, verify non-empty: a network drop can produce a 200 with zero bytes.
    foreach ($asset in @("main.js", "manifest.json")) {
      if (-not $ok) { break }
      $assetPath = Join-Path $pluginDir $asset
      try {
        Invoke-WebRequest -Uri "$baseUrl/$asset" -OutFile $assetPath -ErrorAction Stop | Out-Null
        $assetLen = try { (Get-Item $assetPath -ErrorAction Stop).Length } catch { 0 }
        if ($assetLen -eq 0) {
          Write-Host "  ⚠️  $pluginId/$asset downloaded as empty (network drop?)" -ForegroundColor Yellow
          $ok = $false
        }
      } catch {
        Write-Host "  ⚠️  $pluginId/$asset failed: $($_.Exception.Message)" -ForegroundColor Yellow
        $ok = $false
      }
    }

    # styles.css is optional — not all plugins ship it.
    # Invoke-WebRequest throws on HTTP 4xx/5xx (caught below), but a 200 with zero bytes
    # is possible on a mid-transfer network drop. Check length and remove if empty.
    if ($ok) {
      $cssPath = Join-Path $pluginDir "styles.css"
      try {
        $cssResponse = Invoke-WebRequest -Uri "$baseUrl/styles.css" -OutFile $cssPath -PassThru -ErrorAction Stop
        # Defensive: remove if non-200 or empty (guards against zero-byte writes on network drop)
        $cssLen = try { (Get-Item $cssPath -ErrorAction Stop).Length } catch { 0 }
        if ($cssResponse.StatusCode -ne 200 -or $cssLen -eq 0) {
          try { Remove-Item $cssPath -Force -ErrorAction Stop } catch {
            Write-Host "  ⚠️  Could not remove bad styles.css for ${pluginId}: $($_.Exception.Message)" -ForegroundColor Yellow
          }
        }
      } catch {
        # styles.css is optional — 404 means this plugin doesn't ship one; skip silently.
        # Only warn on unexpected errors (network failures, TLS errors, 5xx, etc.).
        $statusCode = try { [int]$_.Exception.Response.StatusCode.value__ } catch { 0 }
        if ($statusCode -ne 404) {
          Write-Host "  ⚠️  Could not download styles.css for ${pluginId}: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        # Invoke-WebRequest may partially create the OutFile — remove it defensively.
        if (Test-Path $cssPath) {
          try { Remove-Item $cssPath -Force -ErrorAction Stop } catch {
            Write-Host "  ⚠️  Could not remove partial styles.css for ${pluginId}: $($_.Exception.Message)" -ForegroundColor Yellow
          }
        }
      }
    }

    if ($ok) {
      Write-Done "$pluginId"
    } else {
      Write-Host "  ❌ failed $pluginId (download error)" -ForegroundColor Red
      try {
        Remove-Item -Path $pluginDir -Recurse -Force -ErrorAction Stop
      } catch {
        Write-Host "  ⚠️  Could not remove partial directory '$pluginDir'. Remove it manually before opening Obsidian." -ForegroundColor Yellow
      }
      $failedPlugins += $pluginId
    }
  }

  if ($failedPlugins.Count -gt 0) {
    Write-Host
    Print-Info "Some plugins could not be installed automatically:"
    foreach ($p in $failedPlugins) {
      Print-Info "  • $p"
    }
    Print-Info "Install them manually: Settings → Community plugins → Browse"
  }

  return ,@($failedPlugins)
}


# ─── Main ─────────────────────────────────────────────────────────────────────
$script:FailedPlugins = @()
function Main {
  Print-Banner
  Write-Host "$($script:Bold)This script downloads OneBrain and sets up a fresh Obsidian vault.$($script:BoldReset)" -ForegroundColor Cyan
  Write-Host

  Check-Deps

  # ── Step 1: Install location ────────────────────────────────────────────────
  $defaultLocation = (Get-Location).Path
  $installLocation = Prompt-WithDefault "1" "Where should the vault be created?" $defaultLocation

  if (-not (Test-Path $installLocation)) {
    Write-Host "  ? " -NoNewline -ForegroundColor Yellow
    Write-Host "Directory '$installLocation' does not exist. Create it? [Y/n] " -NoNewline
    $confirm = $host.UI.ReadLine()
    if ($confirm -eq '' -or $confirm -match '^[Yy]') {
      try {
        New-Item -ItemType Directory -Path $installLocation -Force | Out-Null
      } catch {
        Print-Error "Could not create '$installLocation'. Check permissions and try again."
        exit 1
      }
      Print-Success "Created $installLocation"
    } else {
      Print-Error "Aborted. Please choose an existing directory."
      exit 1
    }
  }

  # ── Step 2: Vault name ──────────────────────────────────────────────────────
  Write-Host
  $vaultName = Prompt-WithDefault "2" "Vault name?" "onebrain"

  if ($vaultName -match '[\s/\\]') {
    Print-Error "Vault name must not contain spaces or slashes. Got: '$vaultName'"
    exit 1
  }

  $vaultPath = Join-Path $installLocation $vaultName

  if (Test-Path $vaultPath) {
    Print-Error "Target already exists: $vaultPath"
    Print-Error "Please choose a different name or remove the existing directory."
    exit 1
  }

  Write-Host
  Write-Host "$($script:Bold)Vault will be created at: $vaultPath$($script:BoldReset)" -ForegroundColor Cyan
  Write-Host

  # ── Step 3: Download and extract ────────────────────────────────────────────
  $repoUrl = "https://github.com/kengio/onebrain/archive/refs/heads/main.zip"
  $tmpDir  = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
  try {
    New-Item -ItemType Directory -Path $tmpDir -Force -ErrorAction Stop | Out-Null
  } catch {
    Print-Error "Could not create a temporary directory. Check that your system temp folder is writeable."
    exit 1
  }

  try {
    $zipPath = Join-Path $tmpDir "onebrain.zip"

    try {
      Invoke-WebRequest -Uri $repoUrl -OutFile $zipPath -UseBasicParsing
    } catch {
      Print-Error "Download failed. Check your internet connection and try again."
      Print-Error $_.Exception.Message
      throw "error:already-printed"
    }
    Write-Done "Downloaded"

    try {
      Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force
    } catch {
      Print-Error "Extraction failed. The archive may be corrupted or your disk may be full."
      Print-Error $_.Exception.Message
      throw "error:already-printed"
    }
    Write-Done "Extracted"

    # GitHub zip extracts to a directory like onebrain-main/
    try {
      $extractedDir = Get-ChildItem -Path $tmpDir -Directory | Select-Object -First 1
    } catch {
      Print-Error "Could not read extracted directory from '$tmpDir'. Check that your temp folder is accessible."
      Print-Error $_.Exception.Message
      throw "error:already-printed"
    }

    if ($null -eq $extractedDir) {
      Print-Error "Extraction produced no directory. The archive may be malformed."
      throw "error:already-printed"
    }

    try {
      Move-Item -Path $extractedDir.FullName -Destination $vaultPath
    } catch {
      Print-Error "Failed to move the extracted vault to '$vaultPath'."
      Print-Error "Check that '$installLocation' is writeable and has enough space."
      Print-Error $_.Exception.Message
      throw "error:already-printed"
    }

    # ── Step 4: Clean up installed vault ────────────────────────────────────
    # Remove install scripts, README and assets from the vault — they belong to the repo, not the vault.
    # Test-Path first so we error only on real failures (permissions/locks),
    # not on the file simply being absent from the archive.
    $shPath     = Join-Path $vaultPath "install.sh"
    $ps1Path    = Join-Path $vaultPath "install.ps1"
    $readmePath = Join-Path $vaultPath "README.md"
    $assetsPath = Join-Path $vaultPath "assets"
    $contributingPath = Join-Path $vaultPath "CONTRIBUTING.md"
    $licensePath      = Join-Path $vaultPath "LICENSE"
    foreach ($filePath in @($shPath, $ps1Path, $readmePath, $contributingPath, $licensePath)) {
      if (Test-Path $filePath) {
        try {
          Remove-Item $filePath -Force -ErrorAction Stop
        } catch {
          Print-Error "Could not remove '$filePath'. Check directory permissions."
          Print-Error $_.Exception.Message
          throw "error:already-printed"
        }
      }
    }
    if (Test-Path $assetsPath) {
      try {
        Remove-Item $assetsPath -Recurse -Force -ErrorAction Stop
      } catch {
        Print-Error "Could not remove assets directory from '$vaultPath'. Check directory permissions."
        Print-Error $_.Exception.Message
        throw "error:already-printed"
      }
    }

    # Remove any .git directory if included in the archive
    $dotGit = Join-Path $vaultPath ".git"
    if (Test-Path $dotGit) {
      try {
        Remove-Item -Path $dotGit -Recurse -Force -ErrorAction Stop
      } catch {
        Print-Error "Could not remove the bundled .git directory from '$vaultPath'."
        Print-Error "Remove it manually: Remove-Item -Path '$dotGit' -Recurse -Force"
        throw "error:already-printed"
      }
    }

    # ── Step 4: Install community plugins ───────────────────────────────────
    $script:FailedPlugins = @(Install-Plugins $vaultPath)

  } catch {
    # Sentinel "error:already-printed" means a specific message was already shown to the user.
    # Any other exception is unexpected and gets the generic fallback message.
    if ($_.Exception.Message -ne "error:already-printed") {
      Print-Error "Installation failed at an unexpected step: $($_.Exception.Message)"
    }
    exit 1
  } finally {
    try {
      Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction Stop
    } catch {
      Print-Info "Warning: could not remove temporary directory '$tmpDir'. You may remove it manually."
    }
  }

  # ── Step 5: Success ──────────────────────────────────────────────────────────
  Write-Host
  Write-Host "  🎉 OneBrain is ready!" -ForegroundColor Green
  Write-Host
  Print-Success "Vault path: $vaultPath"
  Write-Host
  Write-Host "$($script:Bold)Next steps:$($script:BoldReset)" -ForegroundColor Cyan
  Write-Host
  Write-Host "  1. Open Obsidian"
  Write-Host "     File → Open Folder as Vault → select: $vaultPath"
  $step = 2
  if ($script:FailedPlugins.Count -gt 0) {
    Write-Host "  $step. Install missing plugins manually (Settings → Community plugins → Browse):"
    foreach ($p in $script:FailedPlugins) {
      if ($p) { Write-Host "     $p" -ForegroundColor Cyan }
    }
    $step++
  }
  Write-Host "  $step. Open your terminal in the vault directory:"
  Write-Host "     cd `"$vaultPath`"" -ForegroundColor Cyan
  $step++
  Write-Host "  $step. Start your AI assistant:"
  Write-Host "     claude" -NoNewline -ForegroundColor Cyan
  Write-Host "  or  " -NoNewline
  Write-Host "gemini" -ForegroundColor Cyan
  $step++
  Write-Host "  $step. Run the onboarding command:"
  Write-Host "     /onboarding" -ForegroundColor Cyan
  Write-Host "     (Onboarding personalizes your vault and creates your folders)"
  $step++
  Write-Host "  $step. (Optional) Add Obsidian-specific Claude Code skills:"
  Write-Host "     git clone --depth 1 https://github.com/kepano/obsidian-skills .claude\plugins\obsidian-skills" -ForegroundColor Cyan
  Write-Host
}

Main
