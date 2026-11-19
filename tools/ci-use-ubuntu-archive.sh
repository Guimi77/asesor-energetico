#!/usr/bin/env bash
set -euo pipefail

# Runner images prefer a cloud-region mirror that can stall browser dependency
# downloads. Keep the existing suites and signing keys; choose official HTTPS
# mirrors already included by actions/runner-images instead.
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${RUNNER_OS:-}" != "Linux" ]]; then
  echo "This helper is only for GitHub Actions Linux runners." >&2
  exit 1
fi

readonly aptSources=/etc/apt/sources.list.d/ubuntu.sources
readonly aptMirror=/etc/apt/apt-mirrors.txt
if [[ ! -f "$aptSources" || ! -f "$aptMirror" ]] ||
   ! grep -Eq '^[[:space:]]*URIs:.*mirror\+file:/etc/apt/apt-mirrors\.txt([[:space:]]|$)' "$aptSources"; then
  echo "Unexpected Ubuntu APT mirror configuration." >&2
  exit 1
fi

printf '%s\tpriority:%s\n' \
  'https://archive.ubuntu.com/ubuntu/' 1 \
  'https://security.ubuntu.com/ubuntu/' 2 |
  sudo tee "$aptMirror" >/dev/null

echo "APT uses official Ubuntu HTTPS mirrors; repository signing settings are unchanged."
