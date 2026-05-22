import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(tenantId: string, userId: string, role: Role) {
    const where =
      role === Role.SALES
        ? { tenantId, createdById: userId }
        : { tenantId };

    return this.prisma.order.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        createdById: true,
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
            lat: true,
            lng: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        items: true,
        payments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getOrderById(
    tenantId: string,
    userId: string,
    role: Role,
    orderId: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId,
        ...(role === Role.SALES ? { createdById: userId } : {}),
      },
      include: {
        customer: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        items: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async createOrder(
    tenantId: string,
    userId: string,
    role: Role,
    dto: CreateOrderDto,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must have at least one item');
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: dto.customerId,
        tenantId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (role === Role.SALES && customer.createdById !== userId) {
      throw new ForbiddenException(
        'You can create orders only for your customers',
      );
    }

    const items = dto.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      price: item.price,
      total: item.quantity * item.price,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
    const paidAmount = dto.paidAmount ?? 0;

    if (paidAmount > totalAmount) {
      throw new BadRequestException(
        'Paid amount cannot be greater than total amount',
      );
    }

    const debtAmount = totalAmount - paidAmount;

    return this.prisma.order.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        createdById: userId,
        status: OrderStatus.NEW,
        totalAmount,
        debtAmount,
        items: {
          create: items,
        },
        ...(paidAmount > 0
          ? {
              payments: {
                create: {
                  tenantId,
                  amount: paidAmount,
                  paymentMethod: 'cash',
                },
              },
            }
          : {}),
      },
      include: {
        customer: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        items: true,
        payments: true,
      },
    });
  }
}
