#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ] && command -v tput &>/dev/null && tput colors &>/dev/null; then
  RED=$(tput setaf 1 2>/dev/null || true)
  GREEN=$(tput setaf 2 2>/dev/null || true)
  YELLOW=$(tput setaf 3 2>/dev/null || true)
  CYAN=$(tput setaf 6 2>/dev/null || true)
  BOLD=$(tput bold 2>/dev/null || true)
  RESET=$(tput sgr0 2>/dev/null || true)
else
  RED="" GREEN="" YELLOW="" CYAN="" BOLD="" RESET=""
fi

# ─── Print helpers ────────────────────────────────────────────────────────────
print_info()    { echo "${CYAN}  ${RESET} $*"; }
print_success() { echo "${GREEN}  ${RESET} $*"; }
print_error()   { echo "${RED}  error:${RESET} $*" >&2; }
print_prompt()  { printf "${YELLOW}  ? ${RESET}${BOLD}%s${RESET} " "$*" >&2; }
print_header()  { echo; echo "${BOLD}${CYAN}$*${RESET}"; echo; }

# ─── Dependency check ─────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in curl tar git; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    print_error "Missing required commands: ${missing[*]}"
    print_error "Please install them and re-run this script."
    exit 1
  fi
}

# ─── Prompt helpers ───────────────────────────────────────────────────────────
prompt_with_default() {
  local question="$1"
  local default="$2"
  local answer
  print_prompt "$question [${default}]:"
  if ! read -r answer; then
    echo >&2
    print_error "No input received (EOF). Aborted."
    exit 1
  fi
  echo "${answer:-$default}"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  # ── TTY check: when piped (curl | bash), stdin is the pipe not the terminal.
  # ── Probe /dev/tty for readability first; if open-able, redirect stdin so
  # ── all prompts reach the user's terminal. Two distinct exit paths:
  # ──   (1) /dev/tty not readable  → exits with download instructions
  # ──   (2) /dev/tty readable but exec fails (rare) → exits with instructions
  # ── Uses if-form for exec so set -e doesn't swallow the error handler.
  if [ ! -t 0 ]; then
    if { true < /dev/tty; } 2>/dev/null; then
      if exec < /dev/tty; then
        : # stdin now wired to terminal; all subsequent reads work without < /dev/tty
      else
        print_error "Found /dev/tty but could not redirect stdin to it."
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

  print_header "OneBrain Vault Installer"
  print_info "This script downloads OneBrain and sets up a fresh Obsidian vault."
  echo

  check_deps

  # ── Step 1: Install location ────────────────────────────────────────────────
  local default_location="$HOME/Documents"
  local install_location
  install_location=$(prompt_with_default "Where should the vault be created?" "$default_location")

  # Expand a leading ~ to $HOME (note: ~username forms are not expanded)
  install_location="${install_location/#\~/$HOME}"

  if [ ! -d "$install_location" ]; then
    print_prompt "Directory '$install_location' does not exist. Create it? [Y/n]:"
    if ! read -r confirm; then
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
  local tmpdir
  tmpdir=$(mktemp -d) || { print_error "Could not create a temporary directory. Check that '${TMPDIR:-/tmp}' is writeable and has space."; exit 1; }
  # shellcheck disable=SC2064  # $tmpdir is intentionally captured at definition time (set once, never reassigned)
  trap "rm -rf '$tmpdir'" EXIT

  print_info "Downloading OneBrain..."
  if ! curl -fsSL "$repo_url" -o "$tmpdir/onebrain.tar.gz"; then
    print_error "Download failed. Check your internet connection and try again."
    exit 1
  fi

  # Verify the downloaded file is actually a valid tar archive, not an HTML error page
  if ! tar tzf "$tmpdir/onebrain.tar.gz" >/dev/null 2>&1; then
    print_error "Downloaded file is not a valid archive."
    print_error "The repository may not be published yet, or the URL may have changed."
    print_error "URL: $repo_url"
    exit 1
  fi

  print_info "Extracting..."
  if ! tar xzf "$tmpdir/onebrain.tar.gz" -C "$tmpdir"; then
    print_error "Extraction failed. The archive may be corrupted or your disk may be full."
    exit 1
  fi

  # GitHub tarballs extract to a directory like onebrain-main/
  local extracted_dir
  extracted_dir=$(find "$tmpdir" -maxdepth 1 -mindepth 1 -type d | head -1 || true)

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
  # Remove the install script from the vault — it shouldn't live there
  rm -f "$vault_path/install.sh" || true

  # Remove any .git directory if somehow included in the tarball
  if ! rm -rf "$vault_path/.git"; then
    print_error "Could not remove stale .git from '$vault_path/.git'."
    print_error "Remove it manually: rm -rf \"$vault_path/.git\""
    print_error "Then run: git -C \"$vault_path\" init && git -C \"$vault_path\" add -A && git -C \"$vault_path\" commit -m 'Initial OneBrain vault setup'"
    exit 1
  fi

  # ── Step 5: Initialize git ──────────────────────────────────────────────────
  print_info "Initializing git repository..."
  if ! cd "$vault_path"; then
    print_error "Could not enter vault directory '$vault_path'. Installation may be incomplete."
    exit 1
  fi
  if ! git init -q; then
    print_error "Failed to initialize a git repository in '$vault_path'."
    exit 1
  fi
  if ! git add -A; then
    print_error "Failed to stage files for the initial git commit in '$vault_path'."
    print_error "Check for a stale .git/index.lock file or permission issues."
    exit 1
  fi
  if ! git commit -q -m "Initial OneBrain vault setup"; then
    print_error "Failed to create the initial git commit."
    print_error "Git may need a name and email configured. Run:"
    print_error "  git config --global user.name  'Your Name'"
    print_error "  git config --global user.email 'you@example.com'"
    print_error "Then re-run: git -C \"$vault_path\" add -A && git -C \"$vault_path\" commit -m 'Initial OneBrain vault setup'"
    exit 1
  fi

  # ── Step 6: Success ──────────────────────────────────────────────────────────
  echo
  echo "${GREEN}${BOLD}  OneBrain is ready!${RESET}"
  echo
  print_success "Vault path: ${BOLD}${vault_path}${RESET}"
  echo
  echo "${BOLD}Next steps:${RESET}"
  echo "  1. Open Obsidian"
  echo "     File → Open Folder as Vault → select: ${CYAN}${vault_path}${RESET}"
  echo "  2. When prompted, trust community plugins"
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
