#!/usr/bin/env bash
set -e

BASE_URL="http://localhost:3000"

echo "1) OWNER login tekshirilmoqda..."

OWNER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+998901112233","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "Login OK"

echo "2) Dashboard tekshirilmoqda..."

curl -s "$BASE_URL/dashboard/summary" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | python3 -m json.tool > /tmp/sales-os-dashboard.json

echo "Dashboard OK"

echo "3) Orders tekshirilmoqda..."

curl -s "$BASE_URL/orders" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | python3 -m json.tool > /tmp/sales-os-orders.json

echo "Orders OK"

echo "4) Products tekshirilmoqda..."

curl -s "$BASE_URL/products" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | python3 -m json.tool > /tmp/sales-os-products.json

echo "Products OK"

echo "5) Customers tekshirilmoqda..."

curl -s "$BASE_URL/customers" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | python3 -m json.tool > /tmp/sales-os-customers.json

echo "Customers OK"

echo ""
echo "SMOKE TEST PASSED ✅"
