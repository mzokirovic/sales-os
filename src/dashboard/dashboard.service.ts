import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string) {
    const [
      ordersAggregate,
      customersCount,
      productsCount,
      activeProductsCount,
      newOrdersCount,
      statusGroups,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          tenantId,
        },
        _count: {
          _all: true,
        },
        _sum: {
          totalAmount: true,
          debtAmount: true,
        },
      }),

      this.prisma.customer.count({
        where: {
          tenantId,
        },
      }),

      this.prisma.product.count({
        where: {
          tenantId,
        },
      }),

      this.prisma.product.count({
        where: {
          tenantId,
          isActive: true,
        },
      }),

      this.prisma.order.count({
        where: {
          tenantId,
          status: OrderStatus.NEW,
        },
      }),

      this.prisma.order.groupBy({
        by: ['status'],
        where: {
          tenantId,
        },
        _count: {
          _all: true,
        },
      }),

      this.prisma.order.findMany({
        where: {
          tenantId,
        },
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          debtAmount: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              address: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          items: {
            select: {
              id: true,
              productName: true,
              quantity: true,
              price: true,
              total: true,
            },
          },
        },
      }),
    ]);

    return {
      totalSales: ordersAggregate._sum.totalAmount ?? 0,
      openDebt: ordersAggregate._sum.debtAmount ?? 0,
      ordersCount: ordersAggregate._count._all,
      customersCount,
      productsCount,
      activeProductsCount,
      newOrdersCount,
      statusBreakdown: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      recentOrders,
    };
  }
}
