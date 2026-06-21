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

READY_ORDERS_JSON="$(curl -sS "$API_URL/delivery/ready-orders" \
  -H "Authorization: Bearer $OWNER_TOKEN")"

ORDER_ID="$(
  printf '%s' "$READY_ORDERS_JSON" | python3 -c '
import sys, json

orders = json.load(sys.stdin)
if not orders:
    raise SystemExit("No ready orders found")
print(orders[0]["id"])
'
)"

echo "✅ Ready order found: $ORDER_ID"

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
assert_field_equals "$TRIP_JSON" "stops.0.order.status" "PREPARING"
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
