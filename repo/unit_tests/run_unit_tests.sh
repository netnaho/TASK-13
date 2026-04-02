#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "Installing unit test dependencies..."
npm install --silent 2>/dev/null

echo "Running Jest unit tests..."
echo ""
npx jest --verbose --forceExit 2>&1

echo ""
echo "Unit tests complete."
