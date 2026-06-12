# Sales OS Backend

Backend for Sales OS.

Stack:
- NestJS
- PostgreSQL
- Prisma
- JWT Auth

Local backend URL:
http://localhost:3000

Start backend:
cd ~/Documents/sales-os/backend
npm install
npm run start:dev

Expected:
Nest application successfully started

Database:
sales_os

Example .env:
DATABASE_URL="postgresql://postgres:password@localhost:5432/sales_os"
JWT_SECRET="change-me"

Prisma commands:
npx prisma generate
npx prisma migrate dev
npx prisma studio

Test users:

OWNER:
+998901112233
123456

SALES:
+998901234567
123456

Smoke test:

First start backend:
npm run start:dev

Then in another terminal:
cd ~/Documents/sales-os/backend
./scripts/smoke-test.sh

Expected:
SMOKE TEST PASSED

Main API areas:
- Auth
- Users / Employees
- Customers
- Products
- Orders
- Dashboard

Current MVP rule:

Before adding a new feature, check:
1. Is it needed for real business?
2. Does it break existing API?
3. Can Flutter use it later?
4. Can we test it with smoke test?
