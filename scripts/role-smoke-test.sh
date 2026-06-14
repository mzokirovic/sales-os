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

ORDER_ID="$(curl -s "$BASE_URL/orders" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['id'])")"

echo "CUSTOMER_ID=$CUSTOMER_ID"
echo "PRODUCT_ID=$PRODUCT_ID"
echo "ORDER_ID=$ORDER_ID"

echo
echo "=== USERS ==="
expect "OWNER can list users" "$(status_code GET "$BASE_URL/users" "$OWNER_TOKEN")" "200"
expect "MANAGER can list users" "$(status_code GET "$BASE_URL/users" "$MANAGER_TOKEN")" "200"
expect "SALES cannot list users" "$(status_code GET "$BASE_URL/users" "$SALES_TOKEN")" "403"
expect "OPERATOR cannot list users" "$(status_code GET "$BASE_URL/users" "$OPERATOR_TOKEN")" "403"
expect "WAREHOUSE cannot list users" "$(status_code GET "$BASE_URL/users" "$WAREHOUSE_TOKEN")" "403"
expect "DELIVERY cannot list users" "$(status_code GET "$BASE_URL/users" "$DELIVERY_TOKEN")" "403"

echo
echo "=== CUSTOMERS ==="
expect "OWNER can list customers" "$(status_code GET "$BASE_URL/customers" "$OWNER_TOKEN")" "200"
expect "MANAGER can list customers" "$(status_code GET "$BASE_URL/customers" "$MANAGER_TOKEN")" "200"
expect "SALES can list own customers" "$(status_code GET "$BASE_URL/customers" "$SALES_TOKEN")" "200"
expect "OPERATOR can list customers" "$(status_code GET "$BASE_URL/customers" "$OPERATOR_TOKEN")" "200"
expect "WAREHOUSE cannot list customers" "$(status_code GET "$BASE_URL/customers" "$WAREHOUSE_TOKEN")" "403"
expect "DELIVERY cannot list customers" "$(status_code GET "$BASE_URL/customers" "$DELIVERY_TOKEN")" "403"

echo
echo "=== PRODUCTS ==="
expect "OWNER can list products" "$(status_code GET "$BASE_URL/products" "$OWNER_TOKEN")" "200"
expect "MANAGER can list products" "$(status_code GET "$BASE_URL/products" "$MANAGER_TOKEN")" "200"
expect "SALES can list products" "$(status_code GET "$BASE_URL/products" "$SALES_TOKEN")" "200"
expect "OPERATOR can list products" "$(status_code GET "$BASE_URL/products" "$OPERATOR_TOKEN")" "200"
expect "WAREHOUSE can list products" "$(status_code GET "$BASE_URL/products" "$WAREHOUSE_TOKEN")" "200"
expect "DELIVERY cannot list products" "$(status_code GET "$BASE_URL/products" "$DELIVERY_TOKEN")" "403"

echo
echo "=== ORDERS ==="
expect "OWNER can list orders" "$(status_code GET "$BASE_URL/orders" "$OWNER_TOKEN")" "200"
expect "MANAGER can list orders" "$(status_code GET "$BASE_URL/orders" "$MANAGER_TOKEN")" "200"
expect "SALES can list own orders" "$(status_code GET "$BASE_URL/orders" "$SALES_TOKEN")" "200"
expect "OPERATOR can list orders" "$(status_code GET "$BASE_URL/orders" "$OPERATOR_TOKEN")" "200"
expect "WAREHOUSE can list orders" "$(status_code GET "$BASE_URL/orders" "$WAREHOUSE_TOKEN")" "200"
expect "DELIVERY can list orders" "$(status_code GET "$BASE_URL/orders" "$DELIVERY_TOKEN")" "200"

echo
echo "=== CREATE PERMISSIONS ==="

UNIQUE_SUFFIX="$(date +%s)"

expect "MANAGER cannot create employee" \
  "$(status_code POST "$BASE_URL/users" "$MANAGER_TOKEN" "{\"fullName\":\"Blocked User $UNIQUE_SUFFIX\",\"phone\":\"+99877$UNIQUE_SUFFIX\",\"password\":\"123456\",\"role\":\"SALES\"}")" \
  "403"

expect "SALES cannot create product" \
  "$(status_code POST "$BASE_URL/products" "$SALES_TOKEN" "{\"name\":\"Blocked Product $UNIQUE_SUFFIX\",\"unit\":\"dona\",\"price\":1000}")" \
  "403"

expect "OPERATOR cannot create product" \
  "$(status_code POST "$BASE_URL/products" "$OPERATOR_TOKEN" "{\"name\":\"Blocked Operator Product $UNIQUE_SUFFIX\",\"unit\":\"dona\",\"price\":1000}")" \
  "403"

expect "WAREHOUSE cannot create order" \
  "$(status_code POST "$BASE_URL/orders" "$WAREHOUSE_TOKEN" "{\"customerId\":\"$CUSTOMER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}],\"paidAmount\":0}")" \
  "403"

expect "DELIVERY cannot create order" \
  "$(status_code POST "$BASE_URL/orders" "$DELIVERY_TOKEN" "{\"customerId\":\"$CUSTOMER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}],\"paidAmount\":0}")" \
  "403"

echo
echo "=== SUMMARY ==="
echo "PASS: $PASS_COUNT"
echo "FAIL: $FAIL_COUNT"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
