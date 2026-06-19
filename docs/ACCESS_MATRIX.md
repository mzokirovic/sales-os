# Sales OS Access Matrix v1

## Core rule

Backend is the source of truth for permissions.

Web and mobile may hide buttons for better UX, but backend must always enforce:
- who can see data
- who can create data
- who can update status
- who can add payments
- who can manage products/employees

## Roles

- OWNER
- MANAGER
- SALES
- OPERATOR
- WAREHOUSE
- DELIVERY

## Order status flow

Payment is not part of fulfillment status.

Fulfillment status:

NEW -> CHECKED -> CONFIRMED -> PREPARING -> SHIPPED -> DELIVERED

Payment status is calculated from payments:

- UNPAID: paidAmount = 0 and debtAmount > 0
- PARTIAL: paidAmount > 0 and debtAmount > 0
- PAID: debtAmount = 0

## Permission Matrix

| Area / Action | OWNER | MANAGER | SALES | OPERATOR | WAREHOUSE | DELIVERY |
|---|---:|---:|---:|---:|---:|---:|
| View dashboard | yes | yes | own scope | yes | limited | limited |
| View customers | all | all | own | all | basic | delivery basic |
| Create customer | yes | yes | yes | no | no | no |
| View orders | all | all | own | all | relevant | relevant |
| Create order | yes | yes | yes | yes | no | no |
| Add payment | yes | yes | own orders | yes | no | no |
| View products | yes | yes | active | active | active | active |
| Manage products | yes | yes | no | no | no | no |
| View employees | yes | yes | no | no | no | no |
| Manage employees | yes | yes | no | no | no | no |

## Status transition permissions

| Transition | OWNER | MANAGER | SALES | OPERATOR | WAREHOUSE | DELIVERY |
|---|---:|---:|---:|---:|---:|---:|
| NEW -> CHECKED | yes | yes | no | yes | no | no |
| CHECKED -> CONFIRMED | yes | yes | no | yes | no | no |
| CONFIRMED -> PREPARING | yes | yes | no | no | yes | no |
| PREPARING -> SHIPPED | yes | yes | no | no | yes | no |
| SHIPPED -> DELIVERED | yes | yes | no | no | no | yes |
| DELIVERED -> PAID | no | no | no | no | no | no |

## Payment rules

Payments are historical records.

One order can have many payments.

Example:

- Order total: 1,000,000
- Payment 1: 200,000
- Payment 2: 300,000
- Payment 3: 500,000

Then:

- paidAmount = 1,000,000
- debtAmount = 0
- paymentStatus = PAID

Payment amount cannot be greater than current debt.

## Archive / closed order rule

An order is considered closed for daily work when:

- fulfillment status = DELIVERED
- paymentStatus = PAID

Closed orders must stay in database for reports, customer history, debt audit, and analytics.
