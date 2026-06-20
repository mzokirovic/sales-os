import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

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

    return drivers.map((driver) => ({
      ...driver,
      availability: 'AVAILABLE',
      activeStopsCount: 0,
    }));
  }
}
