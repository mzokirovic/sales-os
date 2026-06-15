#!/usr/bin/env bash
set -euo pipefail

API_URL="https://sales-os-backend-0y70.onrender.com"

PHONE="+998901112233"
PASSWORD="123456"

echo "1) Login..."
LOGIN_RESPONSE=$(curl -sS -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\"}")

TOKEN=$(python3 - <<PY
import json
data=json.loads('''$LOGIN_RESPONSE''')
print(data.get("accessToken") or data.get("token") or "")
PY
)

if [ -z "$TOKEN" ]; then
  echo "LOGIN FAILED:"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "2) Get customers..."
CUSTOMERS_RESPONSE=$(curl -sS "$API_URL/customers" \
  -H "Authorization: Bearer $TOKEN")

CUSTOMER_ID=$(python3 - <<PY
import json
data=json.loads('''$CUSTOMERS_RESPONSE''')
if not data:
    raise SystemExit("No customers found")
print(data[0]["id"])
PY
)

echo "3) Get active products..."
PRODUCTS_RESPONSE=$(curl -sS "$API_URL/products/active" \
  -H "Authorization: Bearer $TOKEN")

PRODUCT_ID=$(python3 - <<PY
import json
data=json.loads('''$PRODUCTS_RESPONSE''')
if not data:
    raise SystemExit("No active products found")
print(data[0]["id"])
PY
)

echo "4) Create unpaid order..."
CREATE_RESPONSE=$(curl -sS -X POST "$API_URL/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"$CUSTOMER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":2}],\"paidAmount\":0}")

ORDER_ID=$(python3 - <<PY
import json
data=json.loads('''$CREATE_RESPONSE''')
print(data["id"])
PY
)

TOTAL=$(python3 - <<PY
import json
data=json.loads('''$CREATE_RESPONSE''')
print(int(data["totalAmount"]))
PY
)

DEBT=$(python3 - <<PY
import json
data=json.loads('''$CREATE_RESPONSE''')
print(int(data["debtAmount"]))
PY
)

PAYMENT_STATUS=$(python3 - <<PY
import json
data=json.loads('''$CREATE_RESPONSE''')
print(data.get("paymentStatus"))
PY
)

echo "Created order: $ORDER_ID"
echo "Total: $TOTAL | Debt: $DEBT | PaymentStatus: $PAYMENT_STATUS"

if [ "$PAYMENT_STATUS" != "UNPAID" ]; then
  echo "Expected UNPAID, got $PAYMENT_STATUS"
  exit 1
fi

echo "5) Try invalid status PAID..."
PAID_STATUS_CODE=$(curl -sS -o /tmp/paid-status-response.json -w "%{http_code}" \
  -X PATCH "$API_URL/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"PAID\"}")

echo "PAID transition HTTP: $PAID_STATUS_CODE"

if [ "$PAID_STATUS_CODE" = "200" ] || [ "$PAID_STATUS_CODE" = "201" ]; then
  echo "PAID transition should not be allowed"
  cat /tmp/paid-status-response.json
  exit 1
fi

PARTIAL_AMOUNT=$((TOTAL / 2))
if [ "$PARTIAL_AMOUNT" -lt 1 ]; then
  PARTIAL_AMOUNT=1
fi

echo "6) Add partial payment: $PARTIAL_AMOUNT..."
PARTIAL_RESPONSE=$(curl -sS -X POST "$API_URL/orders/$ORDER_ID/payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":$PARTIAL_AMOUNT,\"paymentMethod\":\"cash\"}")

PARTIAL_STATUS=$(python3 - <<PY
import json
data=json.loads('''$PARTIAL_RESPONSE''')
print(data.get("paymentStatus"))
PY
)

REMAINING_DEBT=$(python3 - <<PY
import json
data=json.loads('''$PARTIAL_RESPONSE''')
print(int(data["debtAmount"]))
PY
)

echo "After partial: $PARTIAL_STATUS | Debt: $REMAINING_DEBT"

if [ "$PARTIAL_STATUS" != "PARTIAL" ]; then
  echo "Expected PARTIAL, got $PARTIAL_STATUS"
  echo "$PARTIAL_RESPONSE"
  exit 1
fi

echo "7) Close remaining debt: $REMAINING_DEBT..."
FINAL_RESPONSE=$(curl -sS -X POST "$API_URL/orders/$ORDER_ID/payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":$REMAINING_DEBT,\"paymentMethod\":\"cash\"}")

FINAL_STATUS=$(python3 - <<PY
import json
data=json.loads('''$FINAL_RESPONSE''')
print(data.get("paymentStatus"))
PY
)

FINAL_DEBT=$(python3 - <<PY
import json
data=json.loads('''$FINAL_RESPONSE''')
print(int(data["debtAmount"]))
PY
)

echo "After final: $FINAL_STATUS | Debt: $FINAL_DEBT"

if [ "$FINAL_STATUS" != "PAID" ]; then
  echo "Expected PAID, got $FINAL_STATUS"
  echo "$FINAL_RESPONSE"
  exit 1
fi

if [ "$FINAL_DEBT" != "0" ]; then
  echo "Expected debt 0, got $FINAL_DEBT"
  echo "$FINAL_RESPONSE"
  exit 1
fi

echo ""
echo "✅ PAYMENT SMOKE TEST PASSED"
