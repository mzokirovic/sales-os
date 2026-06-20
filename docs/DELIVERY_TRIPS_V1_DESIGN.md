# Delivery Trips v1 Design

## Core idea

Delivery supports both:

- one driver delivering one order
- one driver delivering multiple orders on one route

Simple model:

DeliveryTrip = one driver's delivery route
DeliveryTripStop = one shop/address/order inside that route

One order:
1 trip -> 1 stop

Multiple orders:
1 trip -> many stops

## Driver screen principle

Driver sees only:

- shop/customer name
- phone
- address
- map/open navigation action
- product names and quantities
- delivered action

Driver does not see:

- order total
- debt
- paid amount
- payment status
- payment history
- product price
- sales analytics

## Roles

Can create delivery trip:

- OWNER
- MANAGER
- OPERATOR

Can start trip / send goods:

- OWNER
- MANAGER
- WAREHOUSE

Can deliver stops:

- DELIVERY

Cannot create trips:

- SALES
- DELIVERY

## Driver availability

AVAILABLE = no active trip
PLANNED = trip assigned, not started
BUSY = trip in progress
OFFLINE = not available

v1 rule:

- AVAILABLE drivers are selectable
- BUSY and OFFLINE drivers are disabled
- PLANNED drivers are visible with warning
- no automatic assignment in v1

## Success criteria

1. One driver can deliver one order.
2. One driver can deliver multiple orders.
3. Driver screen stays simple.
4. Driver does not see money/payment info.
5. Dispatcher can select only available drivers.
6. Stop-by-stop delivery works.
7. Map integration can be added later without redesign.
