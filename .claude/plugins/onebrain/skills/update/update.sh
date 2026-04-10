#!/usr/bin/env bash
# OneBrain update script — fetch, compare, and apply system files from GitHub.
# Run from vault root.
#
# Usage:
#   bash .claude/plugins/onebrain/skills/update/update.sh           # dry-run (compare only)
#   bash .claude/plugins/onebrain/skills/update/update.sh --apply   # apply updates
#
# Note: wrapped in main() so bash reads the entire script before execution — prevents
# misaligned reads if this file is replaced by its own --apply run.

set -uo pipefail

main() {

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

VAULT_ROOT="$(pwd)"
PLUGIN_DIR="${VAULT_ROOT}/.claude/plugins/onebrain"
REPO="kengio/onebrain"
BRANCH="main"
API_TREE="https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

# Verify vault install
if [[ ! -d "${PLUGIN_DIR}" ]]; then
  echo "ERROR: OneBrain plugin not found at .claude/plugins/onebrain/ — run /onboarding first."
  exit 1
fi

# Fetch upstream file tree
TREE_JSON=$(curl -sf "${API_TREE}" 2>/dev/null) || {
  echo "ERROR: Could not fetch file list from GitHub (network error or rate limit)."
  exit 1
}

# Extract all blob paths
ALL_PATHS=$(echo "${TREE_JSON}" | python3 -c "
import json, sys
for item in json.load(sys.stdin).get('tree', []):
    if item['type'] == 'blob':
        print(item['path'])
" 2>/dev/null) || {
  echo "ERROR: Could not parse file list from GitHub (unexpected response format)."
  exit 1
}

# Allowlist
ALLOW_FILES=(".gitignore")
ALLOW_DIRS=(".claude/plugins/onebrain" ".claude-plugin")

# Tracking arrays
MODIFIED=() ADDED=() UNCHANGED=() FAILED=() DELETED=()

compare_and_apply() {
  local path="$1"
  local local_path="${VAULT_ROOT}/${path}"
  local tmp_file
  tmp_file=$(mktemp)

  if ! curl -sf "${RAW_BASE}/${path}" > "${tmp_file}" 2>/dev/null; then
    FAILED+=("${path}")
    rm -f "${tmp_file}"
    return
  fi

  if [[ ! -f "${local_path}" ]]; then
    if [[ "${APPLY}" == true ]]; then
      mkdir -p "$(dirname "${local_path}")"
      if cp "${tmp_file}" "${local_path}" 2>/dev/null; then
        ADDED+=("${path}")
      else
        FAILED+=("${path}")
      fi
    else
      ADDED+=("${path}")
    fi
  elif diff -q "${tmp_file}" "${local_path}" > /dev/null 2>&1; then
    UNCHANGED+=("${path}")
  else
    if [[ "${APPLY}" == true ]]; then
      if cp "${tmp_file}" "${local_path}" 2>/dev/null; then
        MODIFIED+=("${path}")
      else
        FAILED+=("${path}")
      fi
    else
      MODIFIED+=("${path}")
    fi
  fi

  rm -f "${tmp_file}"
}

# Process individual allowlisted files
for f in "${ALLOW_FILES[@]}"; do
  compare_and_apply "${f}"
done

# Process allowlisted directories
for dir in "${ALLOW_DIRS[@]}"; do
  dir_paths=$(echo "${ALL_PATHS}" | grep "^${dir}/") || true

  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    compare_and_apply "${path}"
  done <<< "${dir_paths}"

  # Find local files absent from upstream (deleted in repo)
  # Guard: skip deletion scan if dir_paths is empty — avoids marking all local files as deleted.
  local_dir="${VAULT_ROOT}/${dir}"
  if [[ -n "${dir_paths}" ]] && [[ -d "${local_dir}" ]]; then
    while IFS= read -r local_abs; do
      rel="${local_abs#${VAULT_ROOT}/}"
      if ! echo "${dir_paths}" | grep -qxF "${rel}"; then
        DELETED+=("${rel}")
        if [[ "${APPLY}" == true ]]; then
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
CACHE_NOTE=""
if [[ "${APPLY}" == true ]]; then
  CLEARED_RAW=""
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
        rm -rf "${ver_dir}" 2>/dev/null || true
        CLEARED_RAW="${CLEARED_RAW}${ver}"$'\n'
      done
    fi
  done
  [[ ${_nullglob_was_set} -eq 0 ]] && shopt -u nullglob
  if [[ -n "${CLEARED_RAW}" ]]; then
    CLEARED_LIST=$(printf '%s' "${CLEARED_RAW}" | sort -u | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
    CACHE_NOTE="  cache: cleared all cached versions (${CLEARED_LIST}) — start a new Claude Code session to reload the plugin"
  fi
fi

# Output report
echo "=== OneBrain Update Report ==="
echo "mode: $([[ "${APPLY}" == true ]] && echo "applied" || echo "dry-run")"
echo "modified: ${#MODIFIED[@]}"
echo "added: ${#ADDED[@]}"
echo "deleted: ${#DELETED[@]}"
echo "unchanged: ${#UNCHANGED[@]}"
echo "failed: ${#FAILED[@]}"

for f in "${MODIFIED[@]+"${MODIFIED[@]}"}"; do echo "  ~ ${f}"; done
for f in "${ADDED[@]+"${ADDED[@]}"}";    do echo "  + ${f}"; done
for f in "${DELETED[@]+"${DELETED[@]}"}"; do echo "  - ${f}"; done
for f in "${FAILED[@]+"${FAILED[@]}"}";  do echo "  ! ${f}"; done

[[ -n "${CACHE_NOTE}" ]] && echo "${CACHE_NOTE}"

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "status: partial_failure"
  exit 1
fi
echo "status: ok"

} # end main
main "$@"
