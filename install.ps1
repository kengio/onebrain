#Requires -Version 5.0
$ErrorActionPreference = 'Stop'

# ─── Colors ───────────────────────────────────────────────────────────────────
function Print-Info    { param($msg) Write-Host "   $msg" -ForegroundColor Cyan }
function Print-Success { param($msg) Write-Host "   $msg" -ForegroundColor Green }
function Print-Error   { param($msg) Write-Host "  error: $msg" -ForegroundColor Red }
function Print-Header  { param($msg) Write-Host; Write-Host $msg -ForegroundColor Cyan; Write-Host }
function Write-Step    { param($emoji, $msg) Write-Host "  $emoji $msg" }
function Write-Done    { param($msg) Write-Host "  ✅ $msg" -ForegroundColor Green }

function Print-Banner {
  Write-Host
  Write-Host " ██████╗ ███╗   ██╗███████╗" -ForegroundColor Blue
  Write-Host "██╔═══██╗████╗  ██║██╔════╝" -ForegroundColor Blue
  Write-Host "██║   ██║██╔██╗ ██║█████╗  " -ForegroundColor Blue
  Write-Host "██║   ██║██║╚██╗██║██╔══╝  " -ForegroundColor Blue
  Write-Host "╚██████╔╝██║ ╚████║███████╗" -ForegroundColor Blue
  Write-Host " ╚═════╝ ╚═╝  ╚═══╝╚══════╝" -ForegroundColor Blue
  Write-Host "██████╗ ██████╗  █████╗ ██╗███╗   ██╗" -ForegroundColor Blue
  Write-Host "██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║" -ForegroundColor Blue
  Write-Host "██████╔╝██████╔╝███████║██║██╔██╗ ██║" -ForegroundColor Blue
  Write-Host "██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║" -ForegroundColor Blue
  Write-Host "██████╔╝██║  ██║██║  ██║██║██║ ╚████║" -ForegroundColor Blue
  Write-Host "╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝" -ForegroundColor Blue
  Write-Host
  Write-Host " > all thoughts. one brain. zero friction." -ForegroundColor Yellow
  Write-Host
}

# ─── Dependency check ─────────────────────────────────────────────────────────
function Check-Deps {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Print-Error "git is required but not found."
    Print-Error "Download it from https://git-scm.com and re-run this script."
    exit 1
  }
}

# ─── Prompt helpers ───────────────────────────────────────────────────────────
function Prompt-WithDefault {
  param([string]$Question, [string]$Default)
  $answer = Read-Host "  ? $Question [$Default]"
  if ([string]::IsNullOrWhiteSpace($answer)) { $Default } else { $answer }
}

# ─── Main ─────────────────────────────────────────────────────────────────────
function Main {
  Print-Banner
  Print-Info "This script downloads OneBrain and sets up a fresh Obsidian vault."
  Write-Host

  Check-Deps

  # ── Step 1: Install location ────────────────────────────────────────────────
  $defaultLocation = (Get-Location).Path
  $installLocation = Prompt-WithDefault "Where should the vault be created?" $defaultLocation

  if (-not (Test-Path $installLocation)) {
    $confirm = Read-Host "  ? Directory '$installLocation' does not exist. Create it? [Y/n]"
    if ($confirm -eq '' -or $confirm -match '^[Yy]') {
      New-Item -ItemType Directory -Path $installLocation -Force | Out-Null
      Print-Success "Created $installLocation"
    } else {
      Print-Error "Aborted. Please choose an existing directory."
      exit 1
    }
  }

  # ── Step 2: Vault name ──────────────────────────────────────────────────────
  $vaultName = Prompt-WithDefault "Vault name?" "onebrain"

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
  Print-Info "Vault will be created at: $vaultPath"
  Write-Host

  # ── Step 3: Download and extract ────────────────────────────────────────────
  $repoUrl = "https://github.com/kengio/onebrain/archive/refs/heads/main.zip"
  $tmpDir  = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

  try {
    Write-Step "📦" "Downloading OneBrain..."
    $zipPath = Join-Path $tmpDir "onebrain.zip"

    try {
      Invoke-RestMethod -Uri $repoUrl -OutFile $zipPath
    } catch {
      Print-Error "Download failed. Check your internet connection and try again."
      Print-Error $_.Exception.Message
      exit 1
    }
    Write-Done "Downloaded"

    Write-Step "🔧" "Extracting..."
    Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force
    Write-Done "Extracted"

    # GitHub zip extracts to a directory like onebrain-main/
    $extractedDir = Get-ChildItem -Path $tmpDir -Directory | Select-Object -First 1

    if ($null -eq $extractedDir) {
      Print-Error "Extraction produced no directory. The archive may be malformed."
      exit 1
    }

    Move-Item -Path $extractedDir.FullName -Destination $vaultPath

    # ── Step 4: Clean up installed vault ────────────────────────────────────
    # Remove install scripts — they shouldn't live in the vault
    Remove-Item -Path (Join-Path $vaultPath "install.sh")  -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $vaultPath "install.ps1") -ErrorAction SilentlyContinue

    # Remove any .git directory if included in the archive
    $dotGit = Join-Path $vaultPath ".git"
    if (Test-Path $dotGit) {
      Remove-Item -Path $dotGit -Recurse -Force
    }

    # ── Step 5: Initialize git ──────────────────────────────────────────────
    Write-Step "🧠" "Initializing git repository..."
    Push-Location $vaultPath
    git init -q
    git add -A
    git commit -q -m "Initial OneBrain vault setup"
    Pop-Location
    Write-Done "Git repository initialized"

  } finally {
    Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  # ── Step 6: Success ──────────────────────────────────────────────────────────
  Write-Host
  Write-Host "  🎉 OneBrain is ready!" -ForegroundColor Green
  Write-Host
  Print-Success "Vault path: $vaultPath"
  Write-Host
  Write-Host "Next steps:" -ForegroundColor White
  Write-Host "  1. Open Obsidian"
  Write-Host "     File -> Open Folder as Vault -> select: $vaultPath"
  Write-Host "  2. Install community plugins (Settings -> Community plugins -> Browse):"
  Write-Host "     Tasks  Dataview  Templater  Calendar" -ForegroundColor Cyan
  Write-Host "     Tag Wrangler  QuickAdd  Obsidian Git  Terminal" -ForegroundColor Cyan
  Write-Host "  3. Open the Terminal plugin in Obsidian and run your AI agent:"
  Write-Host "     claude  or  gemini" -ForegroundColor Cyan
  Write-Host "  4. Run the onboarding command:"
  Write-Host "     /onboarding" -ForegroundColor Cyan
  Write-Host "     (Onboarding will ask you to choose a vault organization method"
  Write-Host "      and create your folders: OneBrain, PARA, or Zettelkasten)"
  Write-Host

  # Offer to open the vault folder in Explorer
  $open = Read-Host "  ? Open vault folder in Explorer? [Y/n]"
  if ($open -eq '' -or $open -match '^[Yy]') {
    Start-Process explorer.exe $vaultPath
  }
}

Main
