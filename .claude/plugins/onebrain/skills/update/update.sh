#!/usr/bin/env bash
# OneBrain update script — fetch, compare, and apply system files from GitHub.
# Run from vault root.
#
# Usage:
#   bash .claude/plugins/onebrain/skills/update/update.sh           # dry-run (compare only)
#   bash .claude/plugins/onebrain/skills/update/update.sh --apply   # apply updates

set -uo pipefail

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
")

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
    ADDED+=("${path}")
    if [[ "${APPLY}" == true ]]; then
      mkdir -p "$(dirname "${local_path}")"
      cp "${tmp_file}" "${local_path}"
    fi
  elif diff -q "${tmp_file}" "${local_path}" > /dev/null 2>&1; then
    UNCHANGED+=("${path}")
  else
    MODIFIED+=("${path}")
    if [[ "${APPLY}" == true ]]; then
      cp "${tmp_file}" "${local_path}"
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
  local_dir="${VAULT_ROOT}/${dir}"
  if [[ -d "${local_dir}" ]]; then
    while IFS= read -r local_abs; do
      rel="${local_abs#${VAULT_ROOT}/}"
      if ! echo "${dir_paths}" | grep -qF "${rel}"; then
        DELETED+=("${rel}")
        if [[ "${APPLY}" == true ]]; then
          rm -f "${local_abs}"
        fi
      fi
    done < <(find "${local_dir}" -type f)
  fi
done

# Clear plugin cache when version is unchanged (apply mode only)
CACHE_NOTE=""
if [[ "${APPLY}" == true ]]; then
  LOCAL_VER=$(python3 -c "
import json
try:
    print(json.load(open('${PLUGIN_DIR}/.claude-plugin/plugin.json'))['version'])
except:
    print('')
" 2>/dev/null || echo "")
  UPSTREAM_VER=$(curl -sf "${RAW_BASE}/.claude/plugins/onebrain/.claude-plugin/plugin.json" 2>/dev/null | \
    python3 -c "import json,sys; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "")

  if [[ -n "${LOCAL_VER}" && "${LOCAL_VER}" == "${UPSTREAM_VER}" ]]; then
    rm -rf "${HOME}/.claude/plugins/cache/onebrain/onebrain/${LOCAL_VER}" 2>/dev/null || true
    rm -rf "${HOME}/.claude/plugins/cache/onebrain-local/onebrain/${LOCAL_VER}" 2>/dev/null || true
    CACHE_NOTE="  cache: cleared plugin cache for v${LOCAL_VER}"
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
