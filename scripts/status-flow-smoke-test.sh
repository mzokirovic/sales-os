#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASSWORD="123456"

OWNER_PHONE="+998901112233"
MANAGER_PHONE="+998900000101"
SALES_PHONE="+998901234567"
OPERATOR_PHONE="+998900000102"
WAREHOUSE_PHONE="+998900000103"
DELIVERY_PHONE="+998900000104"

PASS_COUNT=0
FAIL_COUNT=0

login() {
  local phone="$1"

  curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$phone\",\"password\":\"$PASSWORD\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])"
}

status_code() {
  local method="$1"
  local url="$2"
  local token="$3"
  local body="${4:-}"

  if [[ -n "$body" ]]; then
    curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer $token"
  fi
}

expect() {
  local label="$1"
  local actual="$2"
  local expected="$3"

  if [[ "$actual" == "$expected" ]]; then
    echo "✅ $label => $actual"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "❌ $label => expected $expected, got $actual"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

patch_status() {
  local token="$1"
  local order_id="$2"
  local status="$3"

  status_code PATCH "$BASE_URL/orders/$order_id/status" "$token" "{\"status\":\"$status\"}"
}

create_order() {
  local token="$1"
  local customer_id="$2"
  local product_id="$3"

  curl -s -X POST "$BASE_URL/orders" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"customerId\":\"$customer_id\",\"items\":[{\"productId\":\"$product_id\",\"quantity\":1}],\"paidAmount\":0}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"
}

advance_with_owner() {
  local order_id="$1"
  shift

  for status in "$@"; do
    code="$(patch_status "$OWNER_TOKEN" "$order_id" "$status")"
    if [[ "$code" != "200" ]]; then
      echo "❌ OWNER setup failed: order=$order_id status=$status code=$code"
      exit 1
    fi
  done
}

echo "Logging in..."
OWNER_TOKEN="$(login "$OWNER_PHONE")"
MANAGER_TOKEN="$(login "$MANAGER_PHONE")"
SALES_TOKEN="$(login "$SALES_PHONE")"
OPERATOR_TOKEN="$(login "$OPERATOR_PHONE")"
WAREHOUSE_TOKEN="$(login "$WAREHOUSE_PHONE")"
DELIVERY_TOKEN="$(login "$DELIVERY_PHONE")"

echo
echo "Reading fixtures..."
CUSTOMER_ID="$(curl -s "$BASE_URL/customers" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['id'])")"

PRODUCT_ID="$(curl -s "$BASE_URL/products/active" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['id'])")"

echo "CUSTOMER_ID=$CUSTOMER_ID"
echo "PRODUCT_ID=$PRODUCT_ID"

echo
echo "=== OWNER full status flow ==="
ORDER_OWNER="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
expect "OWNER NEW → CHECKED" "$(patch_status "$OWNER_TOKEN" "$ORDER_OWNER" "CHECKED")" "200"
expect "OWNER CHECKED → CONFIRMED" "$(patch_status "$OWNER_TOKEN" "$ORDER_OWNER" "CONFIRMED")" "200"
expect "OWNER CONFIRMED → PREPARING" "$(patch_status "$OWNER_TOKEN" "$ORDER_OWNER" "PREPARING")" "200"
expect "OWNER PREPARING → READY" "$(patch_status "$OWNER_TOKEN" "$ORDER_OWNER" "READY")" "200"
expect "OWNER cannot READY → SHIPPED through orders endpoint" "$(patch_status "$OWNER_TOKEN" "$ORDER_OWNER" "SHIPPED")" "400"
expect "OWNER cannot READY → PAID" "$(patch_status "$OWNER_TOKEN" "$ORDER_OWNER" "PAID")" "400"

echo
echo "=== MANAGER full status flow ==="
ORDER_MANAGER="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
expect "MANAGER NEW → CHECKED" "$(patch_status "$MANAGER_TOKEN" "$ORDER_MANAGER" "CHECKED")" "200"
expect "MANAGER CHECKED → CONFIRMED" "$(patch_status "$MANAGER_TOKEN" "$ORDER_MANAGER" "CONFIRMED")" "200"
expect "MANAGER CONFIRMED → PREPARING" "$(patch_status "$MANAGER_TOKEN" "$ORDER_MANAGER" "PREPARING")" "200"
expect "MANAGER PREPARING → READY" "$(patch_status "$MANAGER_TOKEN" "$ORDER_MANAGER" "READY")" "200"
expect "MANAGER cannot READY → SHIPPED through orders endpoint" "$(patch_status "$MANAGER_TOKEN" "$ORDER_MANAGER" "SHIPPED")" "400"
expect "MANAGER cannot READY → PAID" "$(patch_status "$MANAGER_TOKEN" "$ORDER_MANAGER" "PAID")" "400"

echo
echo "=== OPERATOR allowed flow ==="
ORDER_OPERATOR="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
expect "OPERATOR NEW → CHECKED" "$(patch_status "$OPERATOR_TOKEN" "$ORDER_OPERATOR" "CHECKED")" "200"
expect "OPERATOR CHECKED → CONFIRMED" "$(patch_status "$OPERATOR_TOKEN" "$ORDER_OPERATOR" "CONFIRMED")" "200"

echo
echo "=== WAREHOUSE allowed flow ==="
ORDER_WAREHOUSE="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
advance_with_owner "$ORDER_WAREHOUSE" "CHECKED" "CONFIRMED"
expect "WAREHOUSE CONFIRMED → PREPARING" "$(patch_status "$WAREHOUSE_TOKEN" "$ORDER_WAREHOUSE" "PREPARING")" "200"
expect "WAREHOUSE PREPARING → READY" "$(patch_status "$WAREHOUSE_TOKEN" "$ORDER_WAREHOUSE" "READY")" "200"
expect "WAREHOUSE cannot READY → SHIPPED through orders endpoint" "$(patch_status "$WAREHOUSE_TOKEN" "$ORDER_WAREHOUSE" "SHIPPED")" "400"

echo
echo "=== DELIVERY generic order status is forbidden ==="
ORDER_DELIVERY="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
advance_with_owner "$ORDER_DELIVERY" "CHECKED" "CONFIRMED" "PREPARING" "READY"
expect "DELIVERY cannot move READY → SHIPPED through orders endpoint" "$(patch_status "$DELIVERY_TOKEN" "$ORDER_DELIVERY" "SHIPPED")" "403"

echo
echo "=== Forbidden role transitions ==="
ORDER_SALES_FORBIDDEN="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
expect "SALES cannot update status" "$(patch_status "$SALES_TOKEN" "$ORDER_SALES_FORBIDDEN" "CHECKED")" "403"

ORDER_OPERATOR_FORBIDDEN="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
advance_with_owner "$ORDER_OPERATOR_FORBIDDEN" "CHECKED" "CONFIRMED"
expect "OPERATOR cannot move CONFIRMED → PREPARING" "$(patch_status "$OPERATOR_TOKEN" "$ORDER_OPERATOR_FORBIDDEN" "PREPARING")" "403"

ORDER_WAREHOUSE_FORBIDDEN="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
advance_with_owner "$ORDER_WAREHOUSE_FORBIDDEN" "CHECKED"
expect "WAREHOUSE cannot move CHECKED → CONFIRMED" "$(patch_status "$WAREHOUSE_TOKEN" "$ORDER_WAREHOUSE_FORBIDDEN" "CONFIRMED")" "403"

ORDER_DELIVERY_FORBIDDEN="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
advance_with_owner "$ORDER_DELIVERY_FORBIDDEN" "CHECKED" "CONFIRMED" "PREPARING"
expect "DELIVERY cannot move PREPARING → SHIPPED" "$(patch_status "$DELIVERY_TOKEN" "$ORDER_DELIVERY_FORBIDDEN" "SHIPPED")" "403"

ORDER_DELIVERY_DELIVERED_FORBIDDEN="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
advance_with_owner "$ORDER_DELIVERY_DELIVERED_FORBIDDEN" "CHECKED" "CONFIRMED" "PREPARING" "READY"
expect "DELIVERY cannot move READY → DELIVERED through orders endpoint" "$(patch_status "$DELIVERY_TOKEN" "$ORDER_DELIVERY_DELIVERED_FORBIDDEN" "DELIVERED")" "403"

echo
echo "=== Invalid transitions ==="
ORDER_INVALID="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
expect "OWNER cannot jump NEW → PREPARING" "$(patch_status "$OWNER_TOKEN" "$ORDER_INVALID" "PREPARING")" "400"

ORDER_SAME_STATUS="$(create_order "$OWNER_TOKEN" "$CUSTOMER_ID" "$PRODUCT_ID")"
expect "OWNER cannot set same status NEW → NEW" "$(patch_status "$OWNER_TOKEN" "$ORDER_SAME_STATUS" "NEW")" "400"

echo
echo "=== SUMMARY ==="
echo "PASS: $PASS_COUNT"
echo "FAIL: $FAIL_COUNT"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
