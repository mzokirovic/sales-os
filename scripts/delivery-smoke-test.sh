#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
PASSWORD="${PASSWORD:-123456}"
OWNER_PHONE="${OWNER_PHONE:-+998901112233}"

echo "🚚 Delivery smoke test started"
echo "API_URL=$API_URL"

login() {
  local phone="$1"

  curl -sS -X POST "$API_URL/auth/login" \
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
    curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer $token"
  fi
}

patch_status() {
  local token="$1"
  local order_id="$2"
  local status="$3"

  status_code PATCH "$API_URL/orders/$order_id/status" "$token" "{\"status\":\"$status\"}"
}

get_first_id() {
  local label="$1"
  local url="$2"
  local token="$3"

  curl -sS "$url" \
    -H "Authorization: Bearer $token" \
    | LABEL="$label" python3 -c '
import os, sys, json

label = os.environ["LABEL"]
data = json.load(sys.stdin)

if not isinstance(data, list) or not data:
    raise SystemExit(f"No {label} found")

print(data[0]["id"])
'
}

create_order() {
  local token="$1"
  local customer_id="$2"
  local product_id="$3"

  curl -sS -X POST "$API_URL/orders" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"customerId\":\"$customer_id\",\"items\":[{\"productId\":\"$product_id\",\"quantity\":1}],\"paidAmount\":0}" \
    | python3 -c '
import sys, json

data = json.load(sys.stdin)
if "id" not in data:
    raise SystemExit(f"Order create failed: {data}")

print(data["id"])
'
}

prepare_ready_order() {
  local token="$1"
  local customer_id
  local product_id
  local order_id
  local code

  customer_id="$(get_first_id "customers" "$API_URL/customers" "$token")"
  product_id="$(get_first_id "active products" "$API_URL/products/active" "$token")"
  order_id="$(create_order "$token" "$customer_id" "$product_id")"

  for status in CHECKED CONFIRMED PREPARING READY; do
    code="$(patch_status "$token" "$order_id" "$status")"
    if [[ "$code" != "200" ]]; then
      echo "Failed to prepare order: order=$order_id status=$status code=$code"
      exit 1
    fi
  done

  echo "$order_id"
}

assert_no_money_fields() {
  local payload="$1"

  printf '%s' "$payload" | python3 -c '
import sys, json

forbidden = {
    "totalAmount",
    "debtAmount",
    "paidAmount",
    "payments",
    "payment",
    "paymentMethod",
    "price",
}

data = json.load(sys.stdin)

def walk(value, path="root"):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in forbidden:
                raise SystemExit(f"Forbidden delivery money field found: {path}.{key}")
            walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, f"{path}[{index}]")

walk(data)
'
}

assert_field_equals() {
  local payload="$1"
  local field_path="$2"
  local expected="$3"

  python3 -c '
import sys, json

field_path = sys.argv[1].split(".")
expected = sys.argv[2]
data = json.load(sys.stdin)

value = data
for part in field_path:
    if part.isdigit():
        value = value[int(part)]
    else:
        value = value[part]

actual = str(value)
display_path = ".".join(field_path)

if actual != expected:
    raise SystemExit(f"Expected {display_path}={expected}, got {actual}")
' "$field_path" "$expected" <<< "$payload"
}


OWNER_TOKEN="$(login "$OWNER_PHONE")"
echo "✅ Owner login OK"

DRIVERS_JSON="$(curl -sS "$API_URL/delivery/drivers" \
  -H "Authorization: Bearer $OWNER_TOKEN")"

read -r DRIVER_ID DRIVER_PHONE < <(
  printf '%s' "$DRIVERS_JSON" | python3 -c '
import sys, json

drivers = json.load(sys.stdin)
for driver in drivers:
    if driver.get("availability") == "AVAILABLE":
        print(driver["id"], driver["phone"])
        break
else:
    raise SystemExit("No AVAILABLE delivery driver found")
'
)

echo "✅ Available driver found: $DRIVER_PHONE"

ORDER_ID="$(prepare_ready_order "$OWNER_TOKEN")"
echo "✅ Test order prepared as READY: $ORDER_ID"

READY_ORDERS_JSON="$(curl -sS "$API_URL/delivery/ready-orders" \
  -H "Authorization: Bearer $OWNER_TOKEN")"

printf '%s' "$READY_ORDERS_JSON" | ORDER_ID="$ORDER_ID" python3 -c '
import os, sys, json

order_id = os.environ["ORDER_ID"]
orders = json.load(sys.stdin)

if not any(order.get("id") == order_id for order in orders):
    raise SystemExit(f"Prepared order not found in ready orders: {order_id}")
'

echo "✅ Prepared order is visible in ready orders"

CREATE_BODY="$(
  DRIVER_ID="$DRIVER_ID" ORDER_ID="$ORDER_ID" python3 -c '
import os, json
print(json.dumps({
    "driverId": os.environ["DRIVER_ID"],
    "orderIds": [os.environ["ORDER_ID"]],
}))
'
)"

TRIP_JSON="$(curl -sS -X POST "$API_URL/delivery/trips" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_BODY")"

TRIP_ID="$(
  printf '%s' "$TRIP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"
)"

STOP_ID="$(
  printf '%s' "$TRIP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['stops'][0]['id'])"
)"

assert_field_equals "$TRIP_JSON" "status" "PLANNED"
assert_field_equals "$TRIP_JSON" "stops.0.order.status" "READY"
echo "✅ Trip created: $TRIP_ID"

DELIVERY_TOKEN="$(login "$DRIVER_PHONE")"
echo "✅ Delivery login OK"

MY_TRIPS_JSON="$(curl -sS "$API_URL/delivery/trips/my" \
  -H "Authorization: Bearer $DELIVERY_TOKEN")"

assert_no_money_fields "$MY_TRIPS_JSON"

printf '%s' "$MY_TRIPS_JSON" | TRIP_ID="$TRIP_ID" STOP_ID="$STOP_ID" python3 -c '
import os, sys, json

trips = json.load(sys.stdin)
trip_id = os.environ["TRIP_ID"]
stop_id = os.environ["STOP_ID"]

for trip in trips:
    if trip["id"] == trip_id:
        if not any(stop["id"] == stop_id for stop in trip["stops"]):
            raise SystemExit("Trip found, but stop not found in my trips")
        break
else:
    raise SystemExit("Created trip not found in delivery my trips")
'

echo "✅ My trips contains created trip and stop"
echo "✅ Delivery my trips has no money fields"

START_JSON="$(curl -sS -X POST "$API_URL/delivery/trips/$TRIP_ID/start" \
  -H "Authorization: Bearer $DELIVERY_TOKEN")"

assert_field_equals "$START_JSON" "status" "IN_PROGRESS"
assert_field_equals "$START_JSON" "stops.0.order.status" "SHIPPED"
assert_no_money_fields "$START_JSON"
echo "✅ Trip started and order moved to SHIPPED"

DELIVER_JSON="$(curl -sS -X POST "$API_URL/delivery/stops/$STOP_ID/deliver" \
  -H "Authorization: Bearer $DELIVERY_TOKEN")"

assert_field_equals "$DELIVER_JSON" "status" "COMPLETED"
assert_field_equals "$DELIVER_JSON" "stops.0.status" "DELIVERED"
assert_field_equals "$DELIVER_JSON" "stops.0.order.status" "DELIVERED"
assert_no_money_fields "$DELIVER_JSON"
echo "✅ Stop delivered and trip completed"

DRIVERS_AFTER_JSON="$(curl -sS "$API_URL/delivery/drivers" \
  -H "Authorization: Bearer $OWNER_TOKEN")"

printf '%s' "$DRIVERS_AFTER_JSON" | DRIVER_ID="$DRIVER_ID" python3 -c '
import os, sys, json

driver_id = os.environ["DRIVER_ID"]
drivers = json.load(sys.stdin)

for driver in drivers:
    if driver["id"] == driver_id:
        if driver["availability"] != "AVAILABLE":
            raise SystemExit(f"Expected driver AVAILABLE, got {driver['availability']}")
        if driver["activeStopsCount"] != 0:
            raise SystemExit(f"Expected activeStopsCount 0, got {driver['activeStopsCount']}")
        break
else:
    raise SystemExit("Driver not found after delivery")
'

echo "✅ Driver returned to AVAILABLE"

DUP_RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST "$API_URL/delivery/stops/$STOP_ID/deliver" \
  -H "Authorization: Bearer $DELIVERY_TOKEN")"

DUP_STATUS="$(printf '%s' "$DUP_RESPONSE" | tail -n 1)"

if [ "$DUP_STATUS" != "400" ]; then
  echo "$DUP_RESPONSE"
  echo "Expected duplicate deliver to return 400, got $DUP_STATUS"
  exit 1
fi

echo "✅ Duplicate deliver rejected with 400"
echo "🎉 Delivery smoke test passed"
