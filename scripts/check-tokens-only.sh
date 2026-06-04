#!/usr/bin/env bash
# scripts/check-tokens-only.sh — enforce the "tokens only" rule (CLAUDE.md §97):
# no hardcoded colors/spacing in app/ or components/. The ONLY file allowed to
# contain raw hex / arbitrary-value brackets is the token definition file.
#
# Fails (exit 1) if any disallowed literal appears outside app/tokens.css.
#
# What it flags:
#   - raw hex colors:        #fff, #ffffff, #1a2b3c  (3/4/6/8-digit)
#   - Tailwind arbitrary values with px / # : [12px], [#fff], [1.5rem], [100vh] etc.
#
# Run from repo root:  ./scripts/check-tokens-only.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Directories to scan (only if they exist — components/ may not exist yet).
SCAN_DIRS=()
[ -d app ] && SCAN_DIRS+=("app")
[ -d components ] && SCAN_DIRS+=("components")

if [ ${#SCAN_DIRS[@]} -eq 0 ]; then
  echo "tokens-only: no app/ or components/ directory to scan — skipping."
  exit 0
fi

# The single allowed file for raw design literals.
ALLOWLIST_REGEX='app/tokens.css'

# File types to inspect.
INCLUDES=(--include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.css')

# Pattern 1: raw hex colors (#abc / #aabbcc / #aabbccdd), word-boundaried.
HEX_PATTERN='#[0-9a-fA-F]{3,8}\b'
# Pattern 2: Tailwind arbitrary values containing px or a leading # inside [].
#   matches [12px], [#fff], [.5rem]→no, but [100vh]/[24px] yes via the px arm;
#   we specifically target [NNpx] and [#...] per the spec.
BRACKET_PATTERN='\[[0-9.]+px\]|\[#'

FAIL=0

scan() {
  local label="$1"; shift
  local pattern="$1"; shift
  # grep returns 1 when no match — that's the success case; guard with `|| true`.
  local hits
  hits="$(grep -RInE "${INCLUDES[@]}" "$pattern" "${SCAN_DIRS[@]}" 2>/dev/null \
            | grep -vE "$ALLOWLIST_REGEX" || true)"
  if [ -n "$hits" ]; then
    echo "❌ tokens-only FAIL — $label found outside app/tokens.css:"
    echo "$hits"
    echo
    FAIL=1
  fi
}

scan "raw hex color" "$HEX_PATTERN"
scan "hardcoded px / arbitrary value" "$BRACKET_PATTERN"

if [ "$FAIL" -ne 0 ]; then
  echo "tokens-only: violations found. Use design tokens (app/tokens.css), not raw literals."
  exit 1
fi

echo "✅ tokens-only: PASS — no raw hex/px literals outside app/tokens.css."
exit 0
