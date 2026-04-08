#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf unknown)"

cat <<EOF
LIFECYCLE_DEV=1
LIFECYCLE_REPO_ROOT=$REPO_ROOT
LIFECYCLE_ROOT=$REPO_ROOT/.lifecycle-runtime-dev
LIFECYCLE_RUNTIME_ROOT=$REPO_ROOT/.lifecycle-runtime-dev
LIFECYCLE_DEV_STATE_ROOT=$REPO_ROOT/.lifecycle-runtime-dev/dev
LIFECYCLE_API_URL=http://127.0.0.1:18787
LIFECYCLE_API_PORT=18787
LIFECYCLE_BRIDGE_URL=http://127.0.0.1:52222
LIFECYCLE_BRIDGE_PORT=52222
LIFECYCLE_GIT_SHA=$GIT_SHA
EOF
