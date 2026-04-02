#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "=== PetMarket Test Suite ==="
echo ""

echo "--- Unit Tests ---"
cd "$ROOT/unit_tests" && bash run_unit_tests.sh
cd "$ROOT"

echo ""
echo "--- API Tests ---"
cd "$ROOT/API_tests" && bash run_api_tests.sh
cd "$ROOT"

echo ""
echo "=== All tests complete ==="
