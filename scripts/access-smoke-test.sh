#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://sales-os-backend-0y70.onrender.com}"

OWNER_PHONE="${OWNER_PHONE:-+998901112233}"
OWNER_PASSWORD="${OWNER_PASSWORD:-123456}"

PASSWORD="123456"
SUFFIX="$(date +%s)"

echo "API: $API_URL"

login() {
  local phone="$1"
  local password="$2"

  local response
  response=$(curl -sS -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$phone\",\"password\":\"$password\"}")

  python3 - <<PY
import json, sys
data=json.loads('''$response''')
token=data.get("accessToken") or data.get("token")
if not token:
    print("LOGIN FAILED for $phone", file=sys.stderr)
    print('''$response''', file=sys.stderr)
    sys.exit(1)
print(token)
PY
}

http_code() {
  local method="$1"
  local path="$2"
  local token="$3"
  local body="${4:-}"

  if [ -n "$body" ]; then
    curl -sS -o /tmp/access-smoke-response.json -w "%{http_code}" \
      -X "$method" "$API_URL$path" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -o /tmp/access-smoke-response.json -w "%{http_code}" \
      -X "$method" "$API_URL$path" \
      -H "Authorization: Bearer $token"
  fi
}

expect_code() {
  local label="$1"
  local actual="$2"
  shift 2
  local expected_codes=("$@")

  for expected in "${expected_codes[@]}"; do
    if [ "$actual" = "$expected" ]; then
      echo "✅ $label -> HTTP $actual"
      return 0
    fi
  done

  echo "❌ $label -> HTTP $actual, expected: ${expected_codes[*]}"
  cat /tmp/access-smoke-response.json || true
  echo ""
  exit 1
}

create_employee() {
  local role="$1"
  local phone="$2"
  local token="$3"

  local body
  body="{\"fullName\":\"Smoke $role $SUFFIX\",\"phone\":\"$phone\",\"password\":\"$PASSWORD\",\"role\":\"$role\"}"

  local code
  code=$(http_code POST "/users" "$token" "$body")

  if [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "409" ]; then
    echo "Employee ready: $role -> HTTP $code"
    return 0
  fi

  echo "❌ Employee create failed for $role -> HTTP $code"
  cat /tmp/access-smoke-response.json || true
  echo ""
  echo "Agar /users endpoint boshqacha bo‘lsa, shu logni yuboring."
  exit 1
}

echo "1) Login OWNER..."
OWNER_TOKEN=$(login "$OWNER_PHONE" "$OWNER_PASSWORD")

SALES_PHONE="+99890${SUFFIX}1"
OPERATOR_PHONE="+99890${SUFFIX}2"
WAREHOUSE_PHONE="+99890${SUFFIX}3"
DELIVERY_PHONE="+99890${SUFFIX}4"

echo "2) Create smoke employees..."
create_employee "SALES" "$SALES_PHONE" "$OWNER_TOKEN"
create_employee "OPERATOR" "$OPERATOR_PHONE" "$OWNER_TOKEN"
create_employee "WAREHOUSE" "$WAREHOUSE_PHONE" "$OWNER_TOKEN"
create_employee "DELIVERY" "$DELIVERY_PHONE" "$OWNER_TOKEN"

echo "3) Login role users..."
SALES_TOKEN=$(login "$SALES_PHONE" "$PASSWORD")
OPERATOR_TOKEN=$(login "$OPERATOR_PHONE" "$PASSWORD")
WAREHOUSE_TOKEN=$(login "$WAREHOUSE_PHONE" "$PASSWORD")
DELIVERY_TOKEN=$(login "$DELIVERY_PHONE" "$PASSWORD")

echo "4) Get customer and product..."
CUSTOMERS=$(curl -sS "$API_URL/customers" -H "Authorization: Bearer $OWNER_TOKEN")
CUSTOMER_ID=$(python3 - <<PY
import json
data=json.loads('''$CUSTOMERS''')
if not data:
    raise SystemExit("No customers found")
print(data[0]["id"])
PY
)

PRODUCTS=$(curl -sS "$API_URL/products/active" -H "Authorization: Bearer $OWNER_TOKEN")
PRODUCT_ID=$(python3 - <<PY
import json
data=json.loads('''$PRODUCTS''')
if not data:
    raise SystemExit("No active products found")
print(data[0]["id"])
PY
)

echo "5) Create access-test order..."
CREATE_ORDER=$(curl -sS -X POST "$API_URL/orders" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"$CUSTOMER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}],\"paidAmount\":0}")

ORDER_ID=$(python3 - <<PY
import json
data=json.loads('''$CREATE_ORDER''')
print(data["id"])
PY
)

echo "Order: $ORDER_ID"

echo "6) Access assertions..."

CODE=$(http_code PATCH "/orders/$ORDER_ID/status" "$SALES_TOKEN" '{"status":"CHECKED"}')
expect_code "SALES cannot update status" "$CODE" 403

CODE=$(http_code POST "/orders" "$WAREHOUSE_TOKEN" "{\"customerId\":\"$CUSTOMER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}],\"paidAmount\":0}")
expect_code "WAREHOUSE cannot create order" "$CODE" 403

CODE=$(http_code POST "/orders/$ORDER_ID/payments" "$DELIVERY_TOKEN" '{"amount":1,"paymentMethod":"cash"}')
expect_code "DELIVERY cannot add payment" "$CODE" 403

CODE=$(http_code PATCH "/orders/$ORDER_ID/status" "$OPERATOR_TOKEN" '{"status":"CHECKED"}')
expect_code "OPERATOR can NEW -> CHECKED" "$CODE" 200 201

CODE=$(http_code PATCH "/orders/$ORDER_ID/status" "$OPERATOR_TOKEN" '{"status":"CONFIRMED"}')
expect_code "OPERATOR can CHECKED -> CONFIRMED" "$CODE" 200 201

CODE=$(http_code PATCH "/orders/$ORDER_ID/status" "$OPERATOR_TOKEN" '{"status":"PREPARING"}')
expect_code "OPERATOR cannot CONFIRMED -> PREPARING" "$CODE" 403

CODE=$(http_code PATCH "/orders/$ORDER_ID/status" "$WAREHOUSE_TOKEN" '{"status":"PREPARING"}')
expect_code "WAREHOUSE can CONFIRMED -> PREPARING" "$CODE" 200 201

CODE=$(http_code PATCH "/orders/$ORDER_ID/status" "$WAREHOUSE_TOKEN" '{"status":"SHIPPED"}')
expect_code "WAREHOUSE can PREPARING -> SHIPPED" "$CODE" 200 201

CODE=$(http_code PATCH "/orders/$ORDER_ID/status" "$DELIVERY_TOKEN" '{"status":"DELIVERED"}')
expect_code "DELIVERY can SHIPPED -> DELIVERED" "$CODE" 200 201

CODE=$(http_code PATCH "/orders/$ORDER_ID/status" "$OWNER_TOKEN" '{"status":"PAID"}')
expect_code "OWNER cannot DELIVERED -> PAID fulfillment status" "$CODE" 400

CODE=$(http_code POST "/orders/$ORDER_ID/payments" "$WAREHOUSE_TOKEN" '{"amount":1,"paymentMethod":"cash"}')
expect_code "WAREHOUSE cannot add payment" "$CODE" 403

CODE=$(http_code POST "/orders/$ORDER_ID/payments" "$OWNER_TOKEN" '{"amount":1,"paymentMethod":"cash"}')
expect_code "OWNER can add payment" "$CODE" 200 201

echo ""
echo "✅ ACCESS SMOKE TEST PASSED"
