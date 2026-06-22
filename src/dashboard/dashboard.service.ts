import { Injectable } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function canViewMoney(role: Role) {
  return role === Role.OWNER || role === Role.MANAGER;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string, role: Role) {
    const moneyAllowed = canViewMoney(role);

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
        ...(moneyAllowed
          ? {
              _sum: {
                totalAmount: true,
                debtAmount: true,
              },
            }
          : {}),
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
          ...(moneyAllowed
            ? {
                totalAmount: true,
                debtAmount: true,
              }
            : {}),
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
              ...(moneyAllowed
                ? {
                    price: true,
                    total: true,
                  }
                : {}),
            },
          },
        },
      }),
    ]);

    return {
      canViewMoney: moneyAllowed,
      ...(moneyAllowed
        ? {
            totalSales: ordersAggregate._sum?.totalAmount ?? 0,
            openDebt: ordersAggregate._sum?.debtAmount ?? 0,
          }
        : {}),
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
