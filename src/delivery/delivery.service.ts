import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DeliveryStopStatus,
  DeliveryTripStatus,
  OrderStatus,
  Role,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryTripDto } from './dto/create-delivery-trip.dto';

type DriverAvailability = 'AVAILABLE' | 'PLANNED' | 'BUSY';

const activeTripStatuses = [
  DeliveryTripStatus.PLANNED,
  DeliveryTripStatus.IN_PROGRESS,
];

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async listDrivers(tenantId: string) {
    const drivers = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: Role.DELIVERY,
      },
      orderBy: {
        fullName: 'asc',
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        role: true,
      },
    });

    const driverIds = drivers.map((driver) => driver.id);

    const activeTrips = await this.prisma.deliveryTrip.findMany({
      where: {
        tenantId,
        driverId: {
          in: driverIds,
        },
        status: {
          in: activeTripStatuses,
        },
      },
      select: {
        driverId: true,
        status: true,
        stops: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    const tripsByDriver = new Map<string, typeof activeTrips>();

    for (const trip of activeTrips) {
      const current = tripsByDriver.get(trip.driverId) ?? [];
      current.push(trip);
      tripsByDriver.set(trip.driverId, current);
    }

    return drivers.map((driver) => {
      const trips = tripsByDriver.get(driver.id) ?? [];
      const availability = this.resolveAvailability(trips);
      const activeStopsCount = trips.reduce(
        (sum, trip) =>
          sum +
          trip.stops.filter((stop) => stop.status === DeliveryStopStatus.PENDING)
            .length,
        0,
      );

      return {
        ...driver,
        availability,
        activeStopsCount,
      };
    });
  }

  async listReadyOrders(tenantId: string) {
    return this.prisma.order.findMany({
      where: {
        tenantId,
        status: {
          in: [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
        },
        deliveryStops: {
          none: {
            status: DeliveryStopStatus.PENDING,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            lat: true,
            lng: true,
          },
        },
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
          },
        },
      },
    });
  }

  async createTrip(
    tenantId: string,
    assignedById: string,
    dto: CreateDeliveryTripDto,
  ) {
    const orderIds = [...new Set(dto.orderIds)];

    if (orderIds.length !== dto.orderIds.length) {
      throw new BadRequestException('Duplicate orders are not allowed');
    }

    const driver = await this.prisma.user.findFirst({
      where: {
        id: dto.driverId,
        tenantId,
        role: Role.DELIVERY,
      },
      select: {
        id: true,
      },
    });

    if (!driver) {
      throw new BadRequestException('Delivery driver not found');
    }

    const activeDriverTrip = await this.prisma.deliveryTrip.findFirst({
      where: {
        tenantId,
        driverId: dto.driverId,
        status: {
          in: activeTripStatuses,
        },
      },
      select: {
        id: true,
      },
    });

    if (activeDriverTrip) {
      throw new BadRequestException('Delivery driver is not available');
    }

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        id: {
          in: orderIds,
        },
      },
      select: {
        id: true,
        status: true,
        deliveryStops: {
          where: {
            status: DeliveryStopStatus.PENDING,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (orders.length !== orderIds.length) {
      throw new BadRequestException('One or more orders were not found');
    }

    for (const order of orders) {
      if (
        order.status !== OrderStatus.CONFIRMED &&
        order.status !== OrderStatus.PREPARING
      ) {
        throw new BadRequestException(
          `Order ${order.id} is not ready for delivery`,
        );
      }

      if (order.deliveryStops.length > 0) {
        throw new BadRequestException(
          `Order ${order.id} is already assigned to a delivery trip`,
        );
      }
    }

    return this.prisma.deliveryTrip.create({
      data: {
        tenantId,
        driverId: dto.driverId,
        assignedById,
        status: DeliveryTripStatus.PLANNED,
        stops: {
          create: orderIds.map((orderId, index) => ({
            tenantId,
            orderId,
            sortOrder: index + 1,
            status: DeliveryStopStatus.PENDING,
          })),
        },
      },
      include: {
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            role: true,
          },
        },
        stops: {
          orderBy: {
            sortOrder: 'asc',
          },
          include: {
            order: {
              select: {
                id: true,
                status: true,
                customer: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    address: true,
                    lat: true,
                    lng: true,
                  },
                },
                items: {
                  select: {
                    id: true,
                    productName: true,
                    quantity: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private resolveAvailability(
    trips: Array<{ status: DeliveryTripStatus }>,
  ): DriverAvailability {
    if (trips.some((trip) => trip.status === DeliveryTripStatus.IN_PROGRESS)) {
      return 'BUSY';
    }

    if (trips.some((trip) => trip.status === DeliveryTripStatus.PLANNED)) {
      return 'PLANNED';
    }

    return 'AVAILABLE';
  }
}
