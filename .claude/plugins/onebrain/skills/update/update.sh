#!/usr/bin/env bash
# OneBrain update script — fetch, compare, and apply system files from GitHub.
# Run from vault root.
#
# Usage:
#   bash .claude/plugins/onebrain/skills/update/update.sh           # dry-run (compare only)
#   bash .claude/plugins/onebrain/skills/update/update.sh --apply   # apply updates
#
# Note: two-layer self-replacement guard:
#   1. main() — bash parses the full function body before executing any of it
#   2. exit $? at end — terminates the process immediately after main() returns,
#      preventing bash from issuing a second read into the now-replaced file on disk.

set -uo pipefail

main() {

apply=false
[[ "${1:-}" == "--apply" ]] && apply=true

vault_root="$(pwd)"
plugin_dir="${vault_root}/.claude/plugins/onebrain"
repo="kengio/onebrain"
branch="main"
api_tree="https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1"
raw_base="https://raw.githubusercontent.com/${repo}/${branch}"

# Verify vault install
if [[ ! -d "${plugin_dir}" ]]; then
  echo "ERROR: OneBrain plugin not found at .claude/plugins/onebrain/ — run /onboarding first."
  exit 1
fi

# Fetch upstream file tree
tree_json=$(curl -sf "${api_tree}" 2>/dev/null) || {
  echo "ERROR: Could not fetch file list from GitHub (network error or rate limit)."
  exit 1
}

# Parse GitHub tree JSON — cross-platform fallback chain (python3 → python → node)
_parse_tree() {
  local input="$1"
  if command -v python3 &>/dev/null; then
    printf '%s' "${input}" | python3 -c "
import json, sys
for item in json.load(sys.stdin).get('tree', []):
    if item['type'] == 'blob':
        print(item['path'])"
  elif command -v python &>/dev/null; then
    printf '%s' "${input}" | python -c "
import json, sys
for item in json.load(sys.stdin).get('tree', []):
    if item['type'] == 'blob':
        print(item['path'])"
  elif command -v node &>/dev/null; then
    printf '%s' "${input}" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const obj=JSON.parse(d);
  const tree=Array.isArray(obj.tree)?obj.tree:[];
  tree.filter(i=>i.type==='blob').forEach(i=>console.log(i.path))
})"
  else
    echo "ERROR: Python (python3/python) and Node.js are unavailable. Install either to use /update." >&2
    exit 1
  fi
}

# Extract all blob paths
all_paths=$(_parse_tree "${tree_json}") || {
  echo "ERROR: Could not parse file list from GitHub (unexpected response format)."
  exit 1
}
if [[ -z "${all_paths}" ]]; then
  echo "ERROR: File list parsed but returned no paths — API response may be empty or rate-limited."
  exit 1
fi

# Allowlist
allow_files=(".gitignore")
allow_dirs=(".claude/plugins/onebrain" ".claude-plugin")

# Tracking arrays
modified=() added=() unchanged=() failed=() deleted=()

compare_and_apply() {
  local path="$1"
  local local_path="${vault_root}/${path}"
  local tmp_file
  tmp_file=$(mktemp)

  if ! curl -sf "${raw_base}/${path}" > "${tmp_file}" 2>/dev/null; then
    failed+=("${path}")
    rm -f "${tmp_file}"
    return
  fi

  if [[ ! -f "${local_path}" ]]; then
    if [[ "${apply}" == true ]]; then
      if ! mkdir -p "$(dirname "${local_path}")" 2>/dev/null; then
        failed+=("${path}")
        rm -f "${tmp_file}"
        return
      fi
      if cp "${tmp_file}" "${local_path}" 2>/dev/null; then
        added+=("${path}")
      else
        failed+=("${path}")
      fi
    else
      added+=("${path}")
    fi
  elif diff -q "${tmp_file}" "${local_path}" > /dev/null 2>&1; then
    unchanged+=("${path}")
  else
    if [[ "${apply}" == true ]]; then
      if cp "${tmp_file}" "${local_path}" 2>/dev/null; then
        modified+=("${path}")
      else
        failed+=("${path}")
      fi
    else
      modified+=("${path}")
    fi
  fi

  rm -f "${tmp_file}"
}

# Process individual allowlisted files
for f in "${allow_files[@]}"; do
  compare_and_apply "${f}"
done

# Process allowlisted directories
for dir in "${allow_dirs[@]}"; do
  dir_paths=$(printf '%s\n' "${all_paths}" | awk -v d="${dir}/" 'substr($0,1,length(d))==d') || true

  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    compare_and_apply "${path}"
  done <<< "${dir_paths}"

  # Find local files absent from upstream (deleted in repo)
  # Guard: skip deletion scan if dir_paths is empty — avoids marking all local files as deleted.
  local_dir="${vault_root}/${dir}"
  if [[ -n "${dir_paths}" ]] && [[ -d "${local_dir}" ]]; then
    while IFS= read -r local_abs; do
      rel="${local_abs#${vault_root}/}"
      if ! echo "${dir_paths}" | grep -qxF "${rel}"; then
        deleted+=("${rel}")
        if [[ "${apply}" == true ]]; then
          rm -f "${local_abs}"
        fi
      fi
    done < <(find "${local_dir}" -type f -not -name ".gitkeep")
  fi
done

# Clear plugin cache on apply — removes all cached versions so Claude Code re-reads from vault
# on the next session start, guaranteeing the latest plugin version is always loaded.
# Confirmed safe: Claude Code re-loads from source (directory) when cache is absent.
# Note: PostToolUse hook errors may appear for the remainder of the current session —
# this is expected and resolves on next session start.
# Claude Code uses ~/.claude/ on all platforms (macOS, Linux, Windows) — confirmed via issue #21916.
cache_note=""
if [[ "${apply}" == true ]]; then
  cleared_raw=""
  local _nullglob_was_set=0
  shopt -q nullglob && _nullglob_was_set=1 || true
  shopt -s nullglob
  for cache_dir in \
    "${HOME}/.claude/plugins/cache/onebrain/onebrain" \
    "${HOME}/.claude/plugins/cache/onebrain-local/onebrain"
  do
    if [[ -d "${cache_dir}" ]]; then
      for ver_dir in "${cache_dir}"/*/; do
        ver=$(basename "${ver_dir}")
        [[ -z "${ver}" ]] && continue
        if rm -rf "${ver_dir}" 2>/dev/null; then
          cleared_raw="${cleared_raw}${ver}"$'\n'
        else
          echo "WARNING: Could not remove cache dir ${ver_dir} — clear it manually if the plugin does not reload." >&2
        fi
      done
    fi
  done
  [[ ${_nullglob_was_set} -eq 0 ]] && shopt -u nullglob
  if [[ -n "${cleared_raw}" ]]; then
    cleared_list=$(printf '%s' "${cleared_raw}" | sort -u | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
    cache_note="  cache: cleared all cached versions (${cleared_list}) — start a new Claude Code session to reload the plugin"
  fi
fi

# Output report
echo "=== OneBrain Update Report ==="
echo "mode: $([[ "${apply}" == true ]] && echo "applied" || echo "dry-run")"
echo "modified: ${#modified[@]}"
echo "added: ${#added[@]}"
echo "deleted: ${#deleted[@]}"
echo "unchanged: ${#unchanged[@]}"
echo "failed: ${#failed[@]}"

for f in "${modified[@]+"${modified[@]}"}"; do echo "  ~ ${f}"; done
for f in "${added[@]+"${added[@]}"}";    do echo "  + ${f}"; done
for f in "${deleted[@]+"${deleted[@]}"}"; do echo "  - ${f}"; done
for f in "${failed[@]+"${failed[@]}"}";  do echo "  ! ${f}"; done

[[ -n "${cache_note}" ]] && echo "${cache_note}"

if [[ ${#failed[@]} -gt 0 ]]; then
  echo "status: partial_failure"
  exit 1
fi
echo "status: ok"

} # end main
main "$@"
exit $?  # terminate immediately after main — prevents bash from reading the replaced script file
