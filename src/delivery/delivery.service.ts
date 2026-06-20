import { Injectable } from '@nestjs/common';
import { DeliveryTripStatus, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type DriverAvailability = 'AVAILABLE' | 'PLANNED' | 'BUSY';

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
          in: [DeliveryTripStatus.PLANNED, DeliveryTripStatus.IN_PROGRESS],
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
        (sum, trip) => sum + trip.stops.filter((stop) => stop.status === 'PENDING').length,
        0,
      );

      return {
        ...driver,
        availability,
        activeStopsCount,
      };
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
