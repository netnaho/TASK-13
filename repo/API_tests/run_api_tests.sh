#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Allow override via environment so the script can run inside a container
# that reaches the backend via service name rather than localhost.
BASE="${API_BASE_URL:-http://localhost:3001/api}"
PASS=0
FAIL=0
TOTAL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}[PASS]${NC} $label"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}[FAIL]${NC} $label (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local label="$1"
  local file="$2"
  local field="$3"
  local expected="$4"
  TOTAL=$((TOTAL + 1))
  local actual
  actual=$(jq -r "$field" "$file" 2>/dev/null || echo "")
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}[PASS]${NC} $label"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}[FAIL]${NC} $label (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  PetMarket API Test Suite${NC}"
echo -e "${YELLOW}========================================${NC}"

# Wait for backend
echo ""
echo "Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" "$BASE/listings" 2>/dev/null | grep -q "200"; then
    echo "Backend is ready."
    break
  fi
  if [ "$i" = "30" ]; then
    echo -e "${RED}Backend not ready after 30s. Aborting.${NC}"
    exit 1
  fi
  sleep 1
done

# ── Auth Tests ────────────────────────────────────────────────────────────────
echo ""
echo "--- Auth Tests ---"

# Login admin
STATUS=$(curl -s -o /tmp/pm_admin.json -w "%{http_code}" \
  -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
assert_status "POST /auth/login (admin) → 201" "201" "$STATUS"
ADMIN_TOKEN=$(jq -r '.data.token // empty' /tmp/pm_admin.json 2>/dev/null || true)

# Login wrong password
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrongpassword"}')
assert_status "POST /auth/login (wrong password) → 401" "401" "$STATUS"

# Register short password
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"shortpw","password":"abc","email":"s@t.com"}')
assert_status "POST /auth/register (short password) → 400" "400" "$STATUS"

# Register duplicate
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"longenoughpassword","email":"dup@t.com"}')
assert_status "POST /auth/register (duplicate) → 409" "409" "$STATUS"

# ── Listings Tests ────────────────────────────────────────────────────────────
echo ""
echo "--- Listings Tests ---"

# Public listing access
STATUS=$(curl -s -o /tmp/pm_listings.json -w "%{http_code}" "$BASE/listings")
assert_status "GET /listings (public) → 200" "200" "$STATUS"

# Search
STATUS=$(curl -s -o /tmp/pm_search.json -w "%{http_code}" "$BASE/listings?q=golden")
assert_status "GET /listings?q=golden → 200" "200" "$STATUS"

# New arrivals
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/listings?newArrivals=true")
assert_status "GET /listings?newArrivals=true → 200" "200" "$STATUS"

# Pagination
STATUS=$(curl -s -o /tmp/pm_page.json -w "%{http_code}" "$BASE/listings?page=1&limit=2")
assert_status "GET /listings?page=1&limit=2 → 200" "200" "$STATUS"

# Suggest
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/listings/suggest?q=gold")
assert_status "GET /listings/suggest?q=gold → 200" "200" "$STATUS"

# Login vendor
STATUS=$(curl -s -o /tmp/pm_vendor.json -w "%{http_code}" \
  -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"vendor","password":"vendor123"}')
VENDOR_TOKEN=$(jq -r '.data.token // empty' /tmp/pm_vendor.json 2>/dev/null || true)

# Vendor creates clean listing
if [ -n "$VENDOR_TOKEN" ]; then
  STATUS=$(curl -s -o /tmp/pm_newlisting.json -w "%{http_code}" \
    -X POST "$BASE/listings" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $VENDOR_TOKEN" \
    -d '{"title":"Clean Beagle Puppy","description":"A wonderful healthy beagle","breed":"Beagle","age":3,"region":"Oregon","priceUsd":700}')
  assert_status "POST /listings (vendor, clean) → 201" "201" "$STATUS"

  # Vendor creates flagged listing
  STATUS=$(curl -s -o /tmp/pm_flagged.json -w "%{http_code}" \
    -X POST "$BASE/listings" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $VENDOR_TOKEN" \
    -d '{"title":"This is a scam pet","description":"totally legit","breed":"Unknown","age":1,"region":"Nowhere","priceUsd":10}')
  assert_status "POST /listings (vendor, 'scam' in title) → 201" "201" "$STATUS"
  assert_json_field "POST /listings flagged=true" "/tmp/pm_flagged.json" ".data.flagged" "true"
fi

# Shopper cannot create listing
STATUS=$(curl -s -o /tmp/pm_shopper.json -w "%{http_code}" \
  -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"shopper","password":"shopper123"}')
SHOPPER_TOKEN=$(jq -r '.data.token // empty' /tmp/pm_shopper.json 2>/dev/null || true)

if [ -n "$SHOPPER_TOKEN" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE/listings" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SHOPPER_TOKEN" \
    -d '{"title":"Test","description":"Testing forbidden","breed":"X","age":1,"region":"X","priceUsd":1}')
  assert_status "POST /listings (shopper) → 403" "403" "$STATUS"
fi

# No results fallback
STATUS=$(curl -s -o /tmp/pm_noresults.json -w "%{http_code}" "$BASE/listings?q=zzznoresultszzz")
assert_status "GET /listings?q=zzznoresultszzz → 200" "200" "$STATUS"

# ── Conversations Tests ───────────────────────────────────────────────────────
echo ""
echo "--- Conversations Tests ---"

if [ -n "$SHOPPER_TOKEN" ]; then
  LISTING_ID=$(jq -r '.data.items[0].id // empty' /tmp/pm_listings.json 2>/dev/null || true)

  if [ -n "$LISTING_ID" ]; then
    # Create conversation
    STATUS=$(curl -s -o /tmp/pm_conv.json -w "%{http_code}" \
      -X POST "$BASE/conversations" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $SHOPPER_TOKEN" \
      -d "{\"listingId\":\"$LISTING_ID\"}")
    assert_status "POST /conversations (shopper) → 201" "201" "$STATUS"

    CONV_ID=$(jq -r '.data.id // empty' /tmp/pm_conv.json 2>/dev/null || true)

    if [ -n "$CONV_ID" ]; then
      # Send message
      STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$BASE/conversations/$CONV_ID/messages" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $SHOPPER_TOKEN" \
        -d '{"type":"text","content":"Hello vendor!"}')
      assert_status "POST /conversations/:id/messages (text) → 201" "201" "$STATUS"

      # Shopper cannot send internal note
      STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$BASE/conversations/$CONV_ID/messages" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $SHOPPER_TOKEN" \
        -d '{"type":"text","content":"internal","isInternal":true}')
      assert_status "POST /conversations/:id/messages (shopper internal) → 403" "403" "$STATUS"

      # Vendor sends internal note
      if [ -n "$VENDOR_TOKEN" ]; then
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
          -X POST "$BASE/conversations/$CONV_ID/messages" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $VENDOR_TOKEN" \
          -d '{"type":"text","content":"vendor internal note","isInternal":true}')
        assert_status "POST /conversations/:id/messages (vendor internal) → 201" "201" "$STATUS"
      fi

      # Shopper gets conversation (should not see internal messages)
      STATUS=$(curl -s -o /tmp/pm_shopper_conv.json -w "%{http_code}" \
        "$BASE/conversations/$CONV_ID" \
        -H "Authorization: Bearer $SHOPPER_TOKEN")
      assert_status "GET /conversations/:id (shopper) → 200" "200" "$STATUS"
    fi
  fi
fi

# ── Settlement Tests ──────────────────────────────────────────────────────────
echo ""
echo "--- Settlement Tests ---"

if [ -n "$ADMIN_TOKEN" ]; then
  # Freight calculate
  STATUS=$(curl -s -o /tmp/pm_freight.json -w "%{http_code}" \
    -X POST "$BASE/settlements/freight/calculate" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"distanceMiles":200,"weightLbs":15,"dimWeightLbs":10,"isOversized":false,"isWeekend":false}')
  assert_status "POST /settlements/freight/calculate → 201" "201" "$STATUS"

  # Generate monthly
  MONTH=$(date +%Y-%m)
  STATUS=$(curl -s -o /tmp/pm_generate.json -w "%{http_code}" \
    -X POST "$BASE/settlements/generate-monthly" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"month\":\"$MONTH\"}")
  assert_status "POST /settlements/generate-monthly (admin) → 201" "201" "$STATUS"
fi

# Wrong role for approval
if [ -n "$SHOPPER_TOKEN" ]; then
  SETTLE_ID=$(jq -r '.data[0].id // empty' /tmp/pm_generate.json 2>/dev/null || true)
  if [ -n "$SETTLE_ID" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$BASE/settlements/$SETTLE_ID/approve-step1" \
      -H "Authorization: Bearer $SHOPPER_TOKEN")
    assert_status "POST /settlements/:id/approve-step1 (shopper) → 403" "403" "$STATUS"
  fi
fi

# ── Export Tests ──────────────────────────────────────────────────────────────
echo ""
echo "--- Export Tests ---"

if [ -n "$ADMIN_TOKEN" ]; then
  STATUS=$(curl -s -o /tmp/pm_export.json -w "%{http_code}" \
    -X POST "$BASE/exports/jobs" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"type":"listings"}')
  assert_status "POST /exports/jobs → 201" "201" "$STATUS"

  EXPORT_ID=$(jq -r '.data.id // empty' /tmp/pm_export.json 2>/dev/null || true)

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE/exports/jobs" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  assert_status "GET /exports/jobs → 200" "200" "$STATUS"

  if [ -n "$EXPORT_ID" ]; then
    # Immediate download (may be 202 or 200)
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      "$BASE/exports/jobs/$EXPORT_ID/download" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "202" ]; then
      TOTAL=$((TOTAL + 1)); PASS=$((PASS + 1))
      echo -e "  ${GREEN}[PASS]${NC} GET /exports/jobs/:id/download → $STATUS (accepted)"
    else
      TOTAL=$((TOTAL + 1)); FAIL=$((FAIL + 1))
      echo -e "  ${RED}[FAIL]${NC} GET /exports/jobs/:id/download → $STATUS (expected 200 or 202)"
    fi
  fi
fi

# ── Audit Tests ───────────────────────────────────────────────────────────────
echo ""
echo "--- Audit Tests ---"

if [ -n "$ADMIN_TOKEN" ]; then
  STATUS=$(curl -s -o /tmp/pm_audit.json -w "%{http_code}" \
    "$BASE/admin/audit" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  assert_status "GET /admin/audit (admin) → 200" "200" "$STATUS"

  AUDIT_ID=$(jq -r '.data.items[0].id // empty' /tmp/pm_audit.json 2>/dev/null || true)
  if [ -n "$AUDIT_ID" ]; then
    STATUS=$(curl -s -o /tmp/pm_verify.json -w "%{http_code}" \
      "$BASE/admin/audit/$AUDIT_ID/verify" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    assert_status "GET /admin/audit/:id/verify → 200" "200" "$STATUS"
  fi
fi

if [ -n "$SHOPPER_TOKEN" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE/admin/audit" \
    -H "Authorization: Bearer $SHOPPER_TOKEN")
  assert_status "GET /admin/audit (shopper) → 403" "403" "$STATUS"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "  Results: ${GREEN}$PASS${NC}/${TOTAL} passed, ${RED}$FAIL${NC} failed"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
