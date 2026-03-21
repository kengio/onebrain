#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ] && command -v tput &>/dev/null && tput colors &>/dev/null; then
  RED=$(tput setaf 1)
  GREEN=$(tput setaf 2)
  YELLOW=$(tput setaf 3)
  CYAN=$(tput setaf 6)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
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
  read -r answer < /dev/tty
  echo "${answer:-$default}"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  print_header "OneBrain Vault Installer"
  print_info "This script downloads OneBrain and sets up a fresh Obsidian vault."
  echo

  check_deps

  # ── TTY check: required for piped installs (curl | bash) ────────────────────
  if [ ! -t 0 ]; then
    if [ -e /dev/tty ]; then
      exec < /dev/tty
    else
      print_error "Cannot read user input (no TTY). Run the script directly instead:"
      print_error "  bash install.sh"
      exit 1
    fi
  fi

  # ── Step 1: Install location ────────────────────────────────────────────────
  local default_location="$HOME/Documents"
  local install_location
  install_location=$(prompt_with_default "Where should the vault be created?" "$default_location")

  # Expand ~ manually in case user typed it
  install_location="${install_location/#\~/$HOME}"

  if [ ! -d "$install_location" ]; then
    print_prompt "Directory '$install_location' does not exist. Create it? [Y/n]:"
    read -r confirm < /dev/tty
    confirm="${confirm:-Y}"
    if [[ "$confirm" =~ ^[Yy] ]]; then
      mkdir -p "$install_location"
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
  tmpdir=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$tmpdir'" EXIT

  print_info "Downloading OneBrain..."
  if ! curl -fsSL "$repo_url" -o "$tmpdir/onebrain.tar.gz"; then
    print_error "Download failed. Check your internet connection and try again."
    exit 1
  fi

  # Verify the downloaded file is actually a gzip archive, not an HTML error page
  if ! gzip -t "$tmpdir/onebrain.tar.gz" 2>/dev/null; then
    print_error "Downloaded file is not a valid archive."
    print_error "The repository may not be published yet, or the URL may have changed."
    print_error "URL: $repo_url"
    exit 1
  fi

  print_info "Extracting..."
  tar xzf "$tmpdir/onebrain.tar.gz" -C "$tmpdir"

  # GitHub tarballs extract to a directory like onebrain-main/
  local extracted_dir
  extracted_dir=$(find "$tmpdir" -maxdepth 1 -mindepth 1 -type d | head -1)

  if [ -z "$extracted_dir" ]; then
    print_error "Extraction produced no directory. The tarball may be malformed."
    exit 1
  fi

  mv "$extracted_dir" "$vault_path"

  # ── Step 4: Clean up installed vault ────────────────────────────────────────
  # Remove the install script from the vault — it shouldn't live there
  rm -f "$vault_path/install.sh"

  # Remove any .git directory if somehow included in the tarball
  rm -rf "$vault_path/.git"

  # ── Step 5: Initialize git ──────────────────────────────────────────────────
  print_info "Initializing git repository..."
  cd "$vault_path"
  git init -q
  git add -A
  git commit -q -m "Initial OneBrain vault setup"

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
