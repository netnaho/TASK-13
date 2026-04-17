#!/usr/bin/env bash
# run_tests.sh — PetMarket test orchestrator.
# Every stage runs inside a Docker container. No host-level tools (npm, curl, jq,
# Playwright) are required beyond Docker Compose itself.
#
# Usage:
#   bash run_tests.sh              # unit + frontend + backend (default, no stack needed)
#   bash run_tests.sh unit         # pure unit tests in container
#   bash run_tests.sh frontend     # frontend Vitest tests in container
#   bash run_tests.sh backend      # backend Jest + postgres in container
#   bash run_tests.sh api          # API smoke tests in container (full stack must be up)
#   bash run_tests.sh e2e          # Playwright E2E in container (full stack must be up)
#   bash run_tests.sh all-with-api # unit + frontend + backend + api
#   bash run_tests.sh all-with-e2e # unit + frontend + backend + api + e2e

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

STAGE="${1:-all}"

# ── Docker Compose detection ───────────────────────────────────────────────────

COMPOSE=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
fi

need_docker() {
  if [ -z "$COMPOSE" ]; then
    echo "ERROR: Docker Compose not found. Stage '${STAGE}' requires Docker." >&2
    exit 1
  fi
}

run_stage() {
  local name="$1"; shift
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Stage: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  "$@"
  echo "  ✓ $name complete"
}

# ── Stage functions ────────────────────────────────────────────────────────────

stage_unit() {
  # Pure unit tests — no DB, no network. Built and run inside a container.
  need_docker
  $COMPOSE --profile test run --rm --build --no-deps test-unit
}

stage_frontend() {
  # Frontend Vitest unit tests — no DB, no network. Built and run inside a container.
  need_docker
  $COMPOSE --profile test run --rm --build --no-deps test-frontend
}

stage_backend() {
  # Backend Jest integration tests — postgres started automatically.
  need_docker
  $COMPOSE --profile test run --rm --build test-backend
}

stage_api() {
  # API smoke tests — runs curl/jq inside the test-api container.
  # Prerequisite: full stack must be running (docker compose up --build).
  # The test-api container reaches the backend via the docker-compose network.
  need_docker
  $COMPOSE --profile test-api run --rm --build test-api
}

stage_e2e() {
  # Playwright E2E smoke tests — runs inside the test-e2e container.
  # Prerequisite: full stack must be running (docker compose up --build).
  # Playwright browsers are baked into the image at build time.
  need_docker
  $COMPOSE --profile test-e2e run --rm --build test-e2e
}

# ── Main ───────────────────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║         PetMarket Test Suite                  ║"
echo "╚═══════════════════════════════════════════════╝"

case "$STAGE" in
  unit)         run_stage "Unit Tests"                stage_unit ;;
  frontend)     run_stage "Frontend Unit Tests"       stage_frontend ;;
  backend)      run_stage "Backend Integration Tests" stage_backend ;;
  api)          run_stage "API Smoke Tests"           stage_api ;;
  e2e)          run_stage "E2E Tests"                 stage_e2e ;;
  all)
    # Default: all containerized stages. No full stack required.
    run_stage "Unit Tests"                stage_unit
    run_stage "Frontend Unit Tests"       stage_frontend
    run_stage "Backend Integration Tests" stage_backend
    ;;
  all-with-api)
    # Requires: docker compose up --build (full stack on :3001)
    run_stage "Unit Tests"                stage_unit
    run_stage "Frontend Unit Tests"       stage_frontend
    run_stage "Backend Integration Tests" stage_backend
    run_stage "API Smoke Tests"           stage_api
    ;;
  all-with-e2e)
    # Requires: docker compose up --build + Playwright installed in e2e/
    run_stage "Unit Tests"                stage_unit
    run_stage "Frontend Unit Tests"       stage_frontend
    run_stage "Backend Integration Tests" stage_backend
    run_stage "API Smoke Tests"           stage_api
    run_stage "E2E Tests"                 stage_e2e
    ;;
  *)
    echo "Unknown stage: $STAGE" >&2
    echo "Valid: unit | frontend | backend | api | e2e | all | all-with-api | all-with-e2e" >&2
    exit 1
    ;;
esac

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║       All selected stages passed ✓            ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
