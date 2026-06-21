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

  async listTrips(tenantId: string) {
    return this.prisma.deliveryTrip.findMany({
      where: {
        tenantId,
        status: {
          in: activeTripStatuses,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
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
          select: {
            id: true,
            sortOrder: true,
            status: true,
            deliveredAt: true,
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
          trip.stops.filter(
            (stop) => stop.status === DeliveryStopStatus.PENDING,
          ).length,
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
        status: OrderStatus.PREPARING,
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

  async listMyTrips(tenantId: string, driverId: string) {
    return this.prisma.deliveryTrip.findMany({
      where: {
        tenantId,
        driverId,
        status: {
          in: activeTripStatuses,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        stops: {
          orderBy: {
            sortOrder: 'asc',
          },
          select: {
            id: true,
            sortOrder: true,
            status: true,
            deliveredAt: true,
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

  async deliverStop(tenantId: string, driverId: string, stopId: string) {
    const stop = await this.prisma.deliveryTripStop.findFirst({
      where: {
        id: stopId,
        tenantId,
        status: DeliveryStopStatus.PENDING,
        order: {
          status: OrderStatus.SHIPPED,
        },
        trip: {
          tenantId,
          driverId,
          status: DeliveryTripStatus.IN_PROGRESS,
        },
      },
      select: {
        id: true,
        orderId: true,
        tripId: true,
      },
    });

    if (!stop) {
      throw new BadRequestException('Delivery stop cannot be delivered');
    }

    const deliveredAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.deliveryTripStop.update({
        where: {
          id: stop.id,
        },
        data: {
          status: DeliveryStopStatus.DELIVERED,
          deliveredAt,
        },
      });

      await tx.order.updateMany({
        where: {
          id: stop.orderId,
          tenantId,
          status: OrderStatus.SHIPPED,
        },
        data: {
          status: OrderStatus.DELIVERED,
        },
      });

      const remainingPendingStops = await tx.deliveryTripStop.count({
        where: {
          tripId: stop.tripId,
          status: DeliveryStopStatus.PENDING,
        },
      });

      if (remainingPendingStops === 0) {
        await tx.deliveryTrip.updateMany({
          where: {
            id: stop.tripId,
            tenantId,
            driverId,
            status: DeliveryTripStatus.IN_PROGRESS,
          },
          data: {
            status: DeliveryTripStatus.COMPLETED,
            completedAt: deliveredAt,
          },
        });
      }

      return tx.deliveryTrip.findFirst({
        where: {
          id: stop.tripId,
          tenantId,
          driverId,
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          stops: {
            orderBy: {
              sortOrder: 'asc',
            },
            select: {
              id: true,
              sortOrder: true,
              status: true,
              deliveredAt: true,
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
    });
  }

  async startTrip(tenantId: string, driverId: string, tripId: string) {
    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.deliveryTrip.findFirst({
        where: {
          id: tripId,
          tenantId,
          driverId,
          status: DeliveryTripStatus.PLANNED,
        },
        select: {
          id: true,
          stops: {
            where: {
              status: DeliveryStopStatus.PENDING,
            },
            select: {
              orderId: true,
              order: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });

      if (!trip || trip.stops.length === 0) {
        throw new BadRequestException('Delivery trip cannot be started');
      }

      if (
        trip.stops.some((stop) => stop.order.status !== OrderStatus.PREPARING)
      ) {
        throw new BadRequestException(
          'Delivery trip has orders that are not ready',
        );
      }

      const startedAt = new Date();
      const orderIds = trip.stops.map((stop) => stop.orderId);

      await tx.deliveryTrip.update({
        where: {
          id: trip.id,
        },
        data: {
          status: DeliveryTripStatus.IN_PROGRESS,
          startedAt,
        },
      });

      await tx.order.updateMany({
        where: {
          tenantId,
          id: {
            in: orderIds,
          },
          status: OrderStatus.PREPARING,
        },
        data: {
          status: OrderStatus.SHIPPED,
        },
      });

      return tx.deliveryTrip.findFirst({
        where: {
          id: trip.id,
          tenantId,
          driverId,
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          stops: {
            orderBy: {
              sortOrder: 'asc',
            },
            select: {
              id: true,
              sortOrder: true,
              status: true,
              deliveredAt: true,
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
    });
  }

  async cancelTrip(tenantId: string, tripId: string) {
    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.deliveryTrip.findFirst({
        where: {
          id: tripId,
          tenantId,
          status: DeliveryTripStatus.PLANNED,
        },
        select: {
          id: true,
        },
      });

      if (!trip) {
        throw new BadRequestException(
          'Only planned delivery trips can be cancelled',
        );
      }

      const cancelledAt = new Date();

      await tx.deliveryTrip.update({
        where: {
          id: trip.id,
        },
        data: {
          status: DeliveryTripStatus.CANCELLED,
          cancelledAt,
        },
      });

      await tx.deliveryTripStop.updateMany({
        where: {
          tenantId,
          tripId: trip.id,
          status: DeliveryStopStatus.PENDING,
        },
        data: {
          status: DeliveryStopStatus.FAILED,
        },
      });

      return tx.deliveryTrip.findFirst({
        where: {
          id: trip.id,
          tenantId,
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
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
            select: {
              id: true,
              sortOrder: true,
              status: true,
              deliveredAt: true,
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
      if (order.status !== OrderStatus.PREPARING) {
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
