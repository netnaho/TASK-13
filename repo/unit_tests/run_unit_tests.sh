#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "Running Jest unit tests..."
echo ""
node_modules/.bin/jest --verbose --forceExit --maxWorkers=2

echo ""
echo "Unit tests complete."
