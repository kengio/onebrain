#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ] && command -v tput &>/dev/null && tput colors &>/dev/null; then
  RED=$(tput setaf 1 2>/dev/null || true)
  GREEN=$(tput setaf 2 2>/dev/null || true)
  YELLOW=$(tput setaf 3 2>/dev/null || true)
  BLUE=$(tput setaf 4 2>/dev/null || true)
  CYAN=$(tput setaf 6 2>/dev/null || true)
  BOLD=$(tput bold 2>/dev/null || true)
  RESET=$(tput sgr0 2>/dev/null || true)
else
  RED="" GREEN="" YELLOW="" BLUE="" CYAN="" BOLD="" RESET=""
fi

# ─── Print helpers ────────────────────────────────────────────────────────────
print_info()    { echo "${CYAN}  ${RESET} $*"; }
print_success() { echo "${GREEN}  ${RESET} $*"; }
print_error()   { echo "${RED}  error:${RESET} $*" >&2; }
print_prompt()  { printf "${YELLOW}  ? ${RESET}${BOLD}%s${RESET} " "$*" >&2; }
print_header()  { echo; echo "${BOLD}${CYAN}$*${RESET}"; echo; }

# ─── Unicode / emoji detection ────────────────────────────────────────────────
if locale charmap 2>/dev/null | grep -qi 'utf-8'; then
  ICON_DL="📦" ICON_EXTRACT="🔧" ICON_GIT="🧠" ICON_OK="✅" ICON_FAIL="❌" ICON_DONE="🎉"
else
  ICON_DL="[DL]" ICON_EXTRACT="[EX]" ICON_GIT="[GIT]" ICON_OK="[OK]" ICON_FAIL="[FAIL]" ICON_DONE="[DONE]"
fi

# ─── Banner ───────────────────────────────────────────────────────────────────
print_banner() {
  echo
  echo "${BLUE}${BOLD} ██████╗ ███╗   ██╗███████╗${RESET}"
  echo "${BLUE}${BOLD}██╔═══██╗████╗  ██║██╔════╝${RESET}"
  echo "${BLUE}${BOLD}██║   ██║██╔██╗ ██║█████╗  ${RESET}"
  echo "${BLUE}${BOLD}██║   ██║██║╚██╗██║██╔══╝  ${RESET}"
  echo "${BLUE}${BOLD}╚██████╔╝██║ ╚████║███████╗${RESET}"
  echo "${BLUE}${BOLD} ╚═════╝ ╚═╝  ╚═══╝╚══════╝${RESET}"
  echo "${BLUE}${BOLD}██████╗ ██████╗  █████╗ ██╗███╗   ██╗${RESET}"
  echo "${BLUE}${BOLD}██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║${RESET}"
  echo "${BLUE}${BOLD}██████╔╝██████╔╝███████║██║██╔██╗ ██║${RESET}"
  echo "${BLUE}${BOLD}██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║${RESET}"
  echo "${BLUE}${BOLD}██████╔╝██║  ██║██║  ██║██║██║ ╚████║${RESET}"
  echo "${BLUE}${BOLD}╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝${RESET}"
  echo
  echo "${YELLOW} > all thoughts. one brain. zero friction.${RESET}"
  echo
}

# ─── Spinner ──────────────────────────────────────────────────────────────────
SPINNER_PID=""
_INSTALL_TMPDIR=""

spinner_start() {
  local msg="$1"
  (
    local i=0
    local chars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    while true; do
      printf "\r  %s %s " "${chars:i%10:1}" "$msg" >&2
      i=$((i + 1))
      sleep 0.08
    done
  ) &
  SPINNER_PID=$!
}

spinner_stop() {
  local emoji="${1:-}"
  local msg="${2:-}"
  if [ -n "${SPINNER_PID:-}" ]; then
    kill "$SPINNER_PID" 2>/dev/null || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
  fi
  printf "\r\033[K  %s %s\n" "$emoji" "$msg" >&2
}

# ─── Cleanup ──────────────────────────────────────────────────────────────────
cleanup() {
  if [ -n "${SPINNER_PID:-}" ]; then
    kill "$SPINNER_PID" 2>/dev/null || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    printf "\r\033[K" >&2
  fi
  if [ -n "${_INSTALL_TMPDIR:-}" ]; then
    if ! rm -rf "$_INSTALL_TMPDIR"; then
      print_info "Warning: could not remove temporary directory '$_INSTALL_TMPDIR'. You may remove it manually."
    fi
    _INSTALL_TMPDIR=""
  fi
}

# ─── Dependency check ─────────────────────────────────────────────────────────
print_install_hint() {
  local cmd="$1"
  local os
  os=$(uname -s 2>/dev/null || echo "unknown")
  case "$cmd" in
    git)
      echo >&2
      echo "${BOLD}  Install git:${RESET}" >&2
      case "$os" in
        Darwin)
          echo "    • Homebrew:  ${CYAN}brew install git${RESET}" >&2
          echo "    • Xcode CLT: ${CYAN}xcode-select --install${RESET}" >&2
          ;;
        Linux)
          echo "    • Debian/Ubuntu: ${CYAN}sudo apt install git${RESET}" >&2
          echo "    • Fedora/RHEL:   ${CYAN}sudo dnf install git${RESET}" >&2
          echo "    • Arch:          ${CYAN}sudo pacman -S git${RESET}" >&2
          ;;
        *)
          echo "    • https://git-scm.com/downloads" >&2
          ;;
      esac
      ;;
    curl)
      echo >&2
      echo "${BOLD}  Install curl:${RESET}" >&2
      case "$os" in
        Darwin)
          echo "    • Homebrew: ${CYAN}brew install curl${RESET}" >&2
          ;;
        Linux)
          echo "    • Debian/Ubuntu: ${CYAN}sudo apt install curl${RESET}" >&2
          echo "    • Fedora/RHEL:   ${CYAN}sudo dnf install curl${RESET}" >&2
          ;;
        *)
          echo "    • https://curl.se/download.html" >&2
          ;;
      esac
      ;;
    tar)
      echo >&2
      echo "${BOLD}  Install tar:${RESET}" >&2
      case "$os" in
        Darwin)
          echo "    • Homebrew: ${CYAN}brew install gnu-tar${RESET}" >&2
          ;;
        Linux)
          echo "    • Debian/Ubuntu: ${CYAN}sudo apt install tar${RESET}" >&2
          echo "    • Fedora/RHEL:   ${CYAN}sudo dnf install tar${RESET}" >&2
          ;;
        *)
          echo "    • https://www.gnu.org/software/tar/" >&2
          ;;
      esac
      ;;
  esac
}

check_deps() {
  local missing=()
  for cmd in curl tar git; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    print_error "Missing required commands: ${missing[*]}"
    for cmd in "${missing[@]}"; do
      print_install_hint "$cmd"
    done
    echo >&2
    print_error "Install the above, then re-run this script."
    exit 1
  fi
}

# ─── Prompt helpers ───────────────────────────────────────────────────────────
prompt_with_default() {
  local question="$1"
  local default="$2"
  local answer
  print_prompt "$question [${default}]:"
  if ! read -r answer <&"$TTY_FD"; then
    echo >&2
    print_error "No input received (EOF). Aborted."
    exit 1
  fi
  echo "${answer:-$default}"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  # ── TTY check: when piped (curl | bash), stdin (fd 0) is the pipe — not the
  # ── terminal. Open /dev/tty as fd 3 so prompts reach the user without
  # ── replacing bash's own command source (which would cause a hang after the
  # ── script finishes). TTY_FD=0 is the default for direct invocation.
  # ── Two exit paths:
  # ──   (1) /dev/tty not readable  → exits with download instructions
  # ──   (2) /dev/tty readable but open fails (rare) → exits with instructions
  TTY_FD=0
  if [ ! -t 0 ]; then
    if { true < /dev/tty; } 2>/dev/null; then
      if exec 3< /dev/tty; then
        TTY_FD=3
      else
        print_error "Found /dev/tty but could not open it for reading."
        print_error "Download and run the script directly instead:"
        print_error "  curl -fsSL https://raw.githubusercontent.com/kengio/onebrain/main/install.sh -o install.sh"
        print_error "  bash install.sh"
        exit 1
      fi
    else
      print_error "Cannot read user input (no accessible TTY)."
      print_error "Download and run the script directly instead:"
      print_error "  curl -fsSL https://raw.githubusercontent.com/kengio/onebrain/main/install.sh -o install.sh"
      print_error "  bash install.sh"
      exit 1
    fi
  fi

  print_banner
  print_info "This script downloads OneBrain and sets up a fresh Obsidian vault."
  echo

  check_deps

  # ── Step 1: Install location ────────────────────────────────────────────────
  local default_location="$PWD"
  local install_location
  install_location=$(prompt_with_default "Where should the vault be created?" "$default_location")

  # Expand a leading ~ to $HOME (note: ~username forms are not expanded)
  install_location="${install_location/#\~/$HOME}"

  if [ ! -d "$install_location" ]; then
    print_prompt "Directory '$install_location' does not exist. Create it? [Y/n]:"
    if ! read -r confirm <&"$TTY_FD"; then
      echo >&2
      print_error "No input received (EOF). Aborted."
      exit 1
    fi
    confirm="${confirm:-Y}"
    if [[ "$confirm" =~ ^[Yy] ]]; then
      if ! mkdir -p "$install_location"; then
        print_error "Could not create '$install_location'. Check permissions and try again."
        exit 1
      fi
      print_success "Created $install_location"
    else
      print_error "Aborted. Please choose an existing directory."
      exit 1
    fi
  fi

  # ── Step 2: Vault name ──────────────────────────────────────────────────────
  local vault_name
  vault_name=$(prompt_with_default "Vault name?" "onebrain")

  # Validate: no spaces or path-breaking characters
  if [[ "$vault_name" =~ [[:space:]/\\] ]]; then
    print_error "Vault name must not contain spaces or slashes. Got: '$vault_name'"
    exit 1
  fi

  local vault_path="$install_location/$vault_name"

  if [ -e "$vault_path" ]; then
    print_error "Target already exists: $vault_path"
    print_error "Please choose a different name or remove the existing directory."
    exit 1
  fi

  echo
  print_info "Vault will be created at: ${BOLD}${vault_path}${RESET}"
  echo

  # ── Step 3: Download and extract ────────────────────────────────────────────
  local repo_url="https://github.com/kengio/onebrain/archive/refs/heads/main.tar.gz"
  trap cleanup EXIT INT TERM
  _INSTALL_TMPDIR=$(mktemp -d) || { print_error "Could not create a temporary directory. Check that '${TMPDIR:-/tmp}' is writeable and has space."; exit 1; }

  spinner_start "$ICON_DL Downloading OneBrain..."
  if ! curl -fsSL "$repo_url" -o "$_INSTALL_TMPDIR/onebrain.tar.gz"; then
    spinner_stop "$ICON_FAIL" ""
    print_error "Download failed. Check your internet connection and try again."
    exit 1
  fi
  spinner_stop "$ICON_OK" "Downloaded"

  # Verify the downloaded file is actually a valid tar archive, not an HTML error page
  if ! tar tzf "$_INSTALL_TMPDIR/onebrain.tar.gz" >/dev/null 2>&1; then
    print_error "Downloaded file is not a valid archive."
    print_error "The repository may not be published yet, or the URL may have changed."
    print_error "URL: $repo_url"
    exit 1
  fi

  spinner_start "$ICON_EXTRACT Extracting..."
  if ! tar xzf "$_INSTALL_TMPDIR/onebrain.tar.gz" -C "$_INSTALL_TMPDIR"; then
    spinner_stop "$ICON_FAIL" ""
    print_error "Extraction failed. The archive may be corrupted or your disk may be full."
    exit 1
  fi
  spinner_stop "$ICON_OK" "Extracted"

  # GitHub tarballs extract to a directory like onebrain-main/
  # The || true tolerates SIGPIPE (exit 141) from head -1 closing the pipe early.
  local extracted_dir
  extracted_dir=$(find "$_INSTALL_TMPDIR" -maxdepth 1 -mindepth 1 -type d | head -1) || true

  if [ -z "$extracted_dir" ]; then
    print_error "Extraction produced no directory. The archive may be malformed or extraction failed."
    exit 1
  fi

  if ! mv "$extracted_dir" "$vault_path"; then
    print_error "Failed to move the extracted vault to '$vault_path'."
    print_error "Check that '$install_location' is writeable and has enough space."
    exit 1
  fi

  # ── Step 4: Clean up installed vault ────────────────────────────────────────
  # Remove install scripts from the vault — they shouldn't live there
  if ! rm -f "$vault_path/install.sh" "$vault_path/install.ps1"; then
    print_error "Could not remove install scripts from '$vault_path'. Check directory permissions."
    exit 1
  fi

  # Remove any .git directory if somehow included in the tarball
  if ! rm -rf "$vault_path/.git"; then
    print_error "Could not remove stale .git from '$vault_path/.git'."
    print_error "Remove it manually: rm -rf \"$vault_path/.git\""
    print_error "Then run: git -C \"$vault_path\" init && git -C \"$vault_path\" add -A && git -C \"$vault_path\" commit -m 'Initial OneBrain vault setup'"
    exit 1
  fi

  # ── Step 5: Initialize git ──────────────────────────────────────────────────
  spinner_start "$ICON_GIT Initializing git repository..."
  if ! git -C "$vault_path" init -q; then
    spinner_stop "$ICON_FAIL" ""
    print_error "Failed to initialize a git repository in '$vault_path'."
    exit 1
  fi
  if ! git -C "$vault_path" add -A; then
    spinner_stop "$ICON_FAIL" ""
    print_error "Failed to stage files for the initial git commit in '$vault_path'."
    print_error "Check for a stale .git/index.lock file or permission issues."
    exit 1
  fi
  if ! git -C "$vault_path" commit -q -m "Initial OneBrain vault setup"; then
    spinner_stop "$ICON_FAIL" ""
    print_error "Failed to create the initial git commit."
    print_error "Git may need a name and email configured. Run:"
    print_error "  git config --global user.name  'Your Name'"
    print_error "  git config --global user.email 'you@example.com'"
    print_error "Then re-run: git -C \"$vault_path\" add -A && git -C \"$vault_path\" commit -m 'Initial OneBrain vault setup'"
    exit 1
  fi
  spinner_stop "$ICON_OK" "Git repository initialized"

  # ── Step 6: Success ──────────────────────────────────────────────────────────
  echo
  echo "${BLUE}${BOLD}  $ICON_DONE OneBrain is ready!${RESET}"
  echo
  print_success "Vault path: ${BOLD}${vault_path}${RESET}"
  echo
  echo "${BOLD}Next steps:${RESET}"
  echo "  1. Open Obsidian"
  echo "     File → Open Folder as Vault → select: ${CYAN}${vault_path}${RESET}"
  echo "  2. Install community plugins (Settings → Community plugins → Browse):"
  echo "     ${CYAN}Tasks  Dataview  Templater  Calendar${RESET}"
  echo "     ${CYAN}Tag Wrangler  QuickAdd  Obsidian Git  Terminal${RESET}"
  echo "  3. Open your terminal in the vault directory:"
  echo "     ${CYAN}cd \"${vault_path}\"${RESET}"
  echo "  4. Start your AI assistant:"
  echo "     ${CYAN}claude${RESET}  or  ${CYAN}gemini${RESET}"
  echo "  5. Run the onboarding command:"
  echo "     ${CYAN}/onboarding${RESET}"
  echo "     (Onboarding will ask you to choose a vault organization method"
  echo "      and create your folders: OneBrain, PARA, or Zettelkasten)"
  echo
}

main "$@"
