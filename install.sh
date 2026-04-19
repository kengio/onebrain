#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
# Color variables are gated on stdout (fd 1) being a TTY. When run as `curl | bash`,
# stdout is the pipe and is not a TTY, so all colors are disabled — including stderr-bound
# functions — to avoid escape sequences in captured output or pipe buffers.
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
print_info()    { echo "${CYAN}  $*${RESET}"; }
print_success() { echo "${GREEN}  $*${RESET}"; }
print_error()   { echo "${RED}  error: $*${RESET}" >&2; }
print_prompt()  { printf "${YELLOW}  ? ${RESET}${BOLD}%s${RESET} " "$*" >&2; }
print_header()  { echo; echo "${BOLD}${CYAN}$*${RESET}"; echo; }

# ─── Unicode / emoji detection ────────────────────────────────────────────────
if locale charmap 2>/dev/null | grep -qi 'utf-8'; then
  ICON_DL="📦" ICON_EXTRACT="🔧" ICON_OK="✅" ICON_FAIL="❌" ICON_DONE="🎉"
else
  ICON_DL="[DL]" ICON_EXTRACT="[EX]" ICON_OK="[OK]" ICON_FAIL="[FAIL]" ICON_DONE="[DONE]"
fi

# ─── Banner ───────────────────────────────────────────────────────────────────
print_banner() {
  echo
  echo "${CYAN}${BOLD}  ___             ____            _       ${RESET}"
  echo "${CYAN}${BOLD} / _ \\ _ __   ___| __ ) _ __ __ _(_)_ __  ${RESET}"
  echo "${CYAN}${BOLD}| | | | '_ \\ / _ \\  _ \\| '__/ _\` | | '_ \\ ${RESET}"
  echo "${CYAN}${BOLD}| |_| | | | |  __/ |_) | | | (_| | | | | |${RESET}"
  echo "${CYAN}${BOLD} \\___/|_| |_|\\___|____/|_|  \\__,_|_|_| |_|${RESET}"
  echo
  echo "${YELLOW} > Two Minds, Think as One, in OneBrain${RESET}"
  echo
}

# ─── Spinner ──────────────────────────────────────────────────────────────────
SPINNER_PID=""
_INSTALL_TMPDIR=""

spinner_start() {
  local msg="$1"
  (
    local i=0
    local chars len
    if locale charmap 2>/dev/null | grep -qi 'utf-8'; then
      chars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    else
      chars='|/-\'
    fi
    len="${#chars}"
    while true; do
      printf "\r  %s %s " "${chars:i%len:1}" "$msg" >&2
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
# print_install_hint: outputs OS-specific install instructions for a missing command.
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
  local number="$1"
  local question="$2"
  local default="$3"
  local answer
  echo "${YELLOW}  ${number}) ${RESET}${BOLD}$question${RESET} ${CYAN}[${default}]${RESET}" >&2
  printf "${YELLOW}  > ${RESET}" >&2
  if ! read -r answer <&"$TTY_FD"; then
    echo >&2
    print_error "No input received (EOF). Aborted."
    exit 1
  fi
  echo "${answer:-$default}"
}

# ─── Plugin installer ─────────────────────────────────────────────────────────
# install_plugins <vault_path>
# Downloads the latest release of each plugin listed in .obsidian/community-plugins.json.
# Uses only curl (already a required dependency) and POSIX tools (grep, sed, mkdir).
# Non-fatal: warns on failure and populates the global FAILED_PLUGINS array with
# any plugin IDs that could not be installed.
install_plugins() {
  local vault="$1"
  local plugins_json="$vault/.obsidian/community-plugins.json"
  local registry_url="https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json"
  local failed_plugins=()

  # Read plugin IDs from the flat JSON array (no jq needed — one string per line after grep)
  if [ ! -f "$plugins_json" ]; then
    return 0
  fi
  local plugin_ids
  plugin_ids=$(grep -o '"[^"]*"' "$plugins_json" | tr -d '"')
  if [ -z "$plugin_ids" ]; then
    return 0
  fi

  print_header "Installing Obsidian community plugins..."

  # Fetch the Obsidian community plugin registry once.
  # Reuse _INSTALL_TMPDIR (cleaned by the EXIT trap) to avoid a separate tempfile leak.
  local registry_file="$_INSTALL_TMPDIR/plugin-registry.json"
  spinner_start "Fetching plugin registry..."
  local registry_err
  if ! registry_err=$(curl -fsSL "$registry_url" -o "$registry_file" 2>&1); then
    spinner_stop "$ICON_FAIL" ""
    print_info "Could not reach the plugin registry${registry_err:+ (${registry_err})}. All plugins will need to be installed manually."
    # Populate FAILED_PLUGINS so the success message shows manual install instructions.
    while IFS= read -r _pid; do
      [ -z "$_pid" ] && continue
      failed_plugins+=("$_pid")
    done <<< "$plugin_ids"
    FAILED_PLUGINS=("${failed_plugins[@]}")
    return 0
  fi
  if [ -n "${SPINNER_PID:-}" ]; then
    kill "$SPINNER_PID" 2>/dev/null || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    printf "\r\033[K" >&2
  fi
  local plugins_dir="$vault/.obsidian/plugins"
  local mkdir_err
  if ! mkdir_err=$(mkdir -p "$plugins_dir" 2>&1); then
    print_info "Could not create plugins directory${mkdir_err:+ (${mkdir_err})}."
    while IFS= read -r _pid; do
      [ -z "$_pid" ] && continue
      failed_plugins+=("$_pid")
    done <<< "$plugin_ids"
    FAILED_PLUGINS=("${failed_plugins[@]}")
    return 0
  fi

  # GitHub REST API: 60 req/hr unauthenticated (shared per IP) — 5,000/hr with GITHUB_TOKEN.
  # Build auth args once; GITHUB_TOKEN does not change during the loop.
  # Accept header is included in the array (not hardcoded on the curl line) so both
  # authenticated and unauthenticated calls send identical headers, and the array is
  # never expanded empty (which would be a no-op, but is cleaner to avoid).
  local curl_auth_args=(-H "Accept: application/vnd.github.v3+json")
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl_auth_args+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  fi

  local curl_errf="$_INSTALL_TMPDIR/curl_err"

  while IFS= read -r plugin_id; do
    [ -z "$plugin_id" ] && continue

    # Validate plugin ID: reject IDs with path-traversal or shell-unsafe characters.
    # All legitimate Obsidian plugin IDs use only alphanumerics, hyphens, and underscores.
    if ! printf '%s' "$plugin_id" | grep -qE '^[a-zA-Z0-9_-]+$'; then
      print_info "  ${YELLOW}skipped${RESET} invalid plugin ID: '${plugin_id}'"
      failed_plugins+=("$plugin_id")
      continue
    fi

    # Extract the GitHub repo for this plugin ID from the registry.
    # grep -F (fixed-string) prevents plugin IDs with special characters from
    # matching unintended entries. grep -A10 assumes "repo" appears within 10 lines
    # of the "id" field — valid for the current Obsidian registry format.
    local repo
    repo=$(grep -F "\"id\": \"${plugin_id}\"" "$registry_file" -A10 \
           | grep '"repo"' \
           | sed 's/.*"repo": *"\([^"]*\)".*/\1/' \
           | head -1)

    if [ -z "$repo" ]; then
      print_info "  ${YELLOW}skipped${RESET} ${plugin_id} (not found in registry)"
      failed_plugins+=("$plugin_id")
      continue
    fi

    # Clear the shared error file before each plugin so stale errors from a prior
    # iteration never bleed into this plugin's failure message.
    : > "$curl_errf"

    spinner_start "  Installing ${plugin_id}..."

    # Use -sSL (not -fsSL) so the response body is preserved on HTTP errors, enabling
    # rate-limit detection. The HTTP status code is appended with -w and parsed below.
    # Stderr (transport errors: DNS, TLS, timeout) is captured to $curl_errf so users
    # see actionable detail instead of a generic "could not get release tag" message.
    local api_raw http_code release_json tag
    api_raw=$(curl -sSL -w '\n%{http_code}' \
      "${curl_auth_args[@]}" \
      "https://api.github.com/repos/${repo}/releases/latest" 2>"$curl_errf") || true
    http_code=$(printf '%s\n' "$api_raw" | tail -1)
    release_json=$(printf '%s\n' "$api_raw" | sed '$d')
    tag=$(printf '%s' "$release_json" \
          | grep '"tag_name"' \
          | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' \
          | head -1)

    if [ -z "$tag" ]; then
      spinner_stop "$ICON_FAIL" ""
      # HTTP 403 can mean rate limit or access denied — check body to distinguish.
      # Rate-limit strings come from GitHub REST API error response "message" field.
      # Note: GitHub primary rate limits now return HTTP 429 (not 403) as of 2023;
      # a 429 would fall through to the generic branch below with its HTTP code shown.
      local api_transport_err
      api_transport_err=$(cat "$curl_errf" 2>/dev/null | head -1 | tr -d '\r')
      if [ "$http_code" = "403" ]; then
        if printf '%s' "$release_json" | grep -qE '"(API rate limit exceeded|exceeded a secondary rate limit)"'; then
          print_info "  ${RED}rate-limited${RESET} ${plugin_id} (GitHub rate limit reached; set GITHUB_TOKEN to raise to 5,000/hr)"
        else
          print_info "  ${YELLOW}skipped${RESET} ${plugin_id} (GitHub API returned 403 — check GITHUB_TOKEN if set)"
        fi
      else
        print_info "  ${YELLOW}skipped${RESET} ${plugin_id} (could not get release tag — HTTP ${http_code:-error}${api_transport_err:+; ${api_transport_err}})"
      fi
      failed_plugins+=("$plugin_id")
      continue
    fi

    local plugin_dir="$plugins_dir/$plugin_id"
    if ! mkdir_err=$(mkdir -p "$plugin_dir" 2>&1); then
      spinner_stop "$ICON_FAIL" ""
      print_info "  ${YELLOW}failed${RESET}  ${plugin_id} (could not create plugin directory${mkdir_err:+: ${mkdir_err}})"
      failed_plugins+=("$plugin_id")
      continue
    fi

    local base_url="https://github.com/${repo}/releases/download/${tag}"
    local ok=true

    # main.js and manifest.json are required; short-circuit on first failure.
    # curl stderr (error details) is captured to $curl_errf for the failure message.
    for asset in main.js manifest.json; do
      if ! curl -fsSL "${base_url}/${asset}" -o "$plugin_dir/${asset}" 2>"$curl_errf"; then
        ok=false
        break
      fi
    done
    # Verify required assets are non-empty: curl can exit 0 but write zero bytes on a
    # network drop mid-transfer, or write an HTML error page if the redirect returned 200.
    if [ "$ok" = true ]; then
      for asset in main.js manifest.json; do
        if [ ! -s "$plugin_dir/$asset" ]; then
          printf '%s: empty or missing after download\n' "$asset" > "$curl_errf"
          ok=false
          break
        fi
      done
    fi

    # styles.css is optional — not all plugins ship it.
    # curl exit 22 = HTTP 4xx/5xx (with -f flag) — expected when asset is absent.
    # curl exit 56 = "failure receiving network data" — GitHub's CDN sometimes resets
    # the connection instead of returning a 404 for a missing release asset; treat as absent.
    # Any other non-zero exit (disk full, TLS error, DNS failure) is unexpected and warns.
    if [ "$ok" = true ]; then
      local css_exit=0
      curl -fsSL "${base_url}/styles.css" -o "$plugin_dir/styles.css" 2>/dev/null || css_exit=$?
      if [ "$css_exit" -ne 0 ] && [ "$css_exit" -ne 22 ] && [ "$css_exit" -ne 56 ]; then
        print_info "  ${YELLOW}warning${RESET} Unexpected error downloading styles.css for ${plugin_id} (curl exit ${css_exit})"
      fi
      # Remove styles.css if absent or zero bytes (curl -f suppresses 404 bodies, leaving an empty file)
      [ -s "$plugin_dir/styles.css" ] || rm -f "$plugin_dir/styles.css"
    fi

    if [ "$ok" = true ]; then
      spinner_stop "$ICON_OK" "${plugin_id}"
    else
      spinner_stop "$ICON_FAIL" ""
      local curl_err_detail
      curl_err_detail=$(cat "$curl_errf" 2>/dev/null | head -1 | tr -d '\r')
      local rm_err
      if ! rm_err=$(rm -rf "$plugin_dir" 2>&1); then
        print_info "  ${YELLOW}warning${RESET} Could not remove partial directory '$plugin_dir': $rm_err"
        print_info "  Remove it manually before opening Obsidian."
      fi
      print_info "  ${YELLOW}failed${RESET}  ${plugin_id} (${curl_err_detail:-download error})"
      failed_plugins+=("$plugin_id")
    fi
  done <<< "$plugin_ids"

  if [ ${#failed_plugins[@]} -gt 0 ]; then
    echo
    print_info "Some plugins could not be installed automatically:"
    for p in "${failed_plugins[@]}"; do
      print_info "  • $p"
    done
    print_info "Install them manually: Settings → Community plugins → Browse"
  fi

  # Populate global for use in the success message
  FAILED_PLUGINS=("${failed_plugins[@]}")
}

# ─── Hook registration ────────────────────────────────────────────────────────
# register_onebrain_hooks <vault_path>
# Writes Stop, PreCompact, and PostCompact hook entries into .claude/settings.json
# using a relative path. Claude Code uses vault root as cwd for hooks, so relative
# paths work and avoid issues with spaces in absolute paths (e.g. iCloud paths).
register_onebrain_hooks() {
  local vault="$1"
  local settings="$vault/.claude/settings.json"
  local hook_script=".claude/plugins/onebrain/hooks/checkpoint-hook.sh"

  if [ ! -f "$settings" ]; then
    print_info "Warning: .claude/settings.json not found — hooks not registered"
    return 0
  fi

  local result=""
  if command -v python3 &>/dev/null; then
    result=$(python3 - "$settings" "$hook_script" <<'PYEOF'
import json, sys
settings_path, hook_script = sys.argv[1], sys.argv[2]
with open(settings_path) as f:
    cfg = json.load(f)
def hook_entry(mode):
    return [{"matcher": "", "hooks": [{"type": "command", "command": f'bash "{hook_script}" {mode}'}]}]
def register_hook(cfg, event, entry):
    # entry is a list containing one matcher-object; extract it for insertion
    new_entry = entry[0]
    hooks = cfg.setdefault("hooks", {})
    entries = hooks.get(event, [])
    if not isinstance(entries, list):
        entries = [entries] if entries else []
    found = False
    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            continue
        # The command is nested: e["hooks"][N]["command"]
        inner = e.get("hooks", [])
        if isinstance(inner, list) and any(
            isinstance(h, dict) and "checkpoint-hook.sh" in h.get("command", "")
            for h in inner
        ):
            entries[i] = new_entry
            found = True
            break
    if not found:
        entries.append(new_entry)
    hooks[event] = entries
register_hook(cfg, "Stop",        hook_entry("stop"))
register_hook(cfg, "PreCompact",  hook_entry("precompact"))
register_hook(cfg, "PostCompact", hook_entry("postcompact"))
with open(settings_path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print("ok")
PYEOF
    2>/dev/null || true)
  elif command -v node &>/dev/null; then
    result=$(node - "$settings" "$hook_script" <<'JSEOF'
const fs = require('fs');
const [,, settingsPath, hookScript] = process.argv;
const cfg = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const hookEntry = mode => ({"matcher":"","hooks":[{"type":"command","command":`bash "${hookScript}" ${mode}`}]});
cfg.hooks = cfg.hooks || {};
function registerHook(cfg, event, entry) {
  let entries = cfg.hooks[event];
  if (!Array.isArray(entries)) entries = entries ? [entries] : [];
  let found = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e && Array.isArray(e.hooks) && e.hooks.some(h => h && typeof h.command === 'string' && h.command.includes('checkpoint-hook.sh'))) {
      entries[i] = entry;
      found = true;
      break;
    }
  }
  if (!found) entries.push(entry);
  cfg.hooks[event] = entries;
}
registerHook(cfg, 'Stop',        hookEntry('stop'));
registerHook(cfg, 'PreCompact',  hookEntry('precompact'));
registerHook(cfg, 'PostCompact', hookEntry('postcompact'));
fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2) + '\n');
process.stdout.write('ok\n');
JSEOF
    2>/dev/null || true)
  fi

  if [ "${result:-}" = "ok" ]; then
    print_info "Registered Stop, PreCompact, PostCompact hooks in .claude/settings.json"
  else
    print_info "Warning: could not register hooks (python3/node not found). Run /update after first session."
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
FAILED_PLUGINS=()
main() {
  # ── TTY check: when piped (curl | bash), stdin (fd 0) is the pipe — not the
  # ── terminal. Open /dev/tty as fd 3 so prompts reach the user without
  # ── replacing bash's own command source (which would cause a hang after the
  # ── script finishes). TTY_FD=0 is the default for direct invocation.
  # ── Two exit paths (in code order):
  # ──   (1) /dev/tty readable but exec 3< fails (rare) → exits with download instructions
  # ──   (2) /dev/tty not readable (no terminal at all) → exits with download instructions
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
  echo "${BOLD}${CYAN}This script downloads OneBrain and sets up a fresh Obsidian vault.${RESET}"
  echo

  check_deps

  # ── Step 1: Install location ────────────────────────────────────────────────
  local default_location="$PWD"
  local install_location
  install_location=$(prompt_with_default 1 "Where should the vault be created?" "$default_location")

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
  echo >&2
  local vault_name
  vault_name=$(prompt_with_default 2 "Vault name?" "onebrain")

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
  echo "${BOLD}${CYAN}Vault will be created at: ${vault_path}${RESET}"
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
  if ! tar tzf "$_INSTALL_TMPDIR/onebrain.tar.gz" >/dev/null; then
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
  # || true prevents set -e from aborting if the find|head -1 pipeline exits non-zero
  # (e.g., SIGPIPE exit 141 when head -1 closes the read end before find finishes).
  # extracted_dir will be empty on genuine failure, caught by the check below.
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
  # Remove install scripts, README and assets from the vault — they belong to the repo, not the vault.
  # rm -f silently succeeds if they are absent; the if-guard catches permission errors only.
  if ! rm -f "$vault_path/install.sh" "$vault_path/install.ps1" "$vault_path/README.md" \
             "$vault_path/CONTRIBUTING.md" "$vault_path/LICENSE"; then
    print_error "Could not remove repo files from '$vault_path'. Check directory permissions."
    exit 1
  fi
  if ! rm -rf "$vault_path/assets"; then
    print_error "Could not remove assets directory from '$vault_path'. Check directory permissions."
    exit 1
  fi

  # Remove any .git directory if somehow included in the tarball
  if ! rm -rf "$vault_path/.git"; then
    print_error "Could not remove stale .git from '$vault_path/.git'."
    print_error "Remove it manually: rm -rf \"$vault_path/.git\""
    exit 1
  fi

  # ── Step 4b: Register OneBrain hooks in .claude/settings.json ───────────
  register_onebrain_hooks "$vault_path"

  # ── Step 4c: Install community plugins ───────────────────────────────────
  install_plugins "$vault_path"

  # ── Step 5: Success ──────────────────────────────────────────────────────────
  echo
  echo "${GREEN}  $ICON_DONE OneBrain is ready!${RESET}"
  echo
  print_success "Vault path: ${vault_path}"
  echo
  echo "${BOLD}${CYAN}Next steps:${RESET}"
  echo
  echo "  1. Open Obsidian"
  echo "     File → Open Folder as Vault → select: ${vault_path}"
  local step=2
  if [ ${#FAILED_PLUGINS[@]} -gt 0 ]; then
    echo "  ${step}. Install missing plugins manually (Settings → Community plugins → Browse):"
    for p in "${FAILED_PLUGINS[@]}"; do
      echo "     ${CYAN}${p}${RESET}"
    done
    step=$((step + 1))
  fi
  echo "  ${step}. Open your terminal in the vault directory:"
  echo "     ${CYAN}cd \"${vault_path}\"${RESET}"
  step=$((step + 1))
  echo "  ${step}. Start your AI assistant:"
  echo "     ${CYAN}claude${RESET}  or  ${CYAN}gemini${RESET}"
  step=$((step + 1))
  echo "  ${step}. Run the onboarding command:"
  echo "     ${CYAN}/onboarding${RESET}"
  echo "     (Onboarding personalizes your vault and creates your folders)"
  step=$((step + 1))
  echo "  ${step}. (Optional) Add Obsidian-specific Claude Code skills:"
  echo "     ${CYAN}git clone --depth 1 https://github.com/kepano/obsidian-skills .claude/plugins/obsidian-skills${RESET}"
  echo
}

main "$@"
