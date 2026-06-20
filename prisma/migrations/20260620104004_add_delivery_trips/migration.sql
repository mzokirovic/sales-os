-- CreateEnum
CREATE TYPE "DeliveryTripStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStopStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "DeliveryTrip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "status" "DeliveryTripStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryTripStop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" "DeliveryStopStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryTripStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryTrip_tenantId_idx" ON "DeliveryTrip"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryTrip_tenantId_status_idx" ON "DeliveryTrip"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DeliveryTrip_tenantId_driverId_idx" ON "DeliveryTrip"("tenantId", "driverId");

-- CreateIndex
CREATE INDEX "DeliveryTrip_tenantId_assignedById_idx" ON "DeliveryTrip"("tenantId", "assignedById");

-- CreateIndex
CREATE INDEX "DeliveryTripStop_tenantId_idx" ON "DeliveryTripStop"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryTripStop_tenantId_status_idx" ON "DeliveryTripStop"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DeliveryTripStop_tenantId_orderId_idx" ON "DeliveryTripStop"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "DeliveryTripStop_tripId_idx" ON "DeliveryTripStop"("tripId");

-- CreateIndex
CREATE INDEX "DeliveryTripStop_orderId_idx" ON "DeliveryTripStop"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryTripStop_tripId_orderId_key" ON "DeliveryTripStop"("tripId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryTripStop_tripId_sortOrder_key" ON "DeliveryTripStop"("tripId", "sortOrder");

-- AddForeignKey
ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTrip" ADD CONSTRAINT "DeliveryTrip_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTripStop" ADD CONSTRAINT "DeliveryTripStop_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTripStop" ADD CONSTRAINT "DeliveryTripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "DeliveryTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTripStop" ADD CONSTRAINT "DeliveryTripStop_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
