import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const allowedNextStatuses: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.CHECKED],
  CHECKED: [OrderStatus.CONFIRMED],
  CONFIRMED: [OrderStatus.PREPARING],
  PREPARING: [OrderStatus.SHIPPED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  PAID: [],
};

type PreparedOrderItem = {
  productId?: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
};

type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

type OrderWithPayments = {
  totalAmount: number;
  debtAmount: number;
  payments: { amount: number }[];
};

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function addPaymentSummary<T extends OrderWithPayments>(order: T) {
  const totalAmount = toNumber(order.totalAmount);
  const paidAmount = order.payments.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );
  const debtAmount = Math.max(totalAmount - paidAmount, 0);

  let paymentStatus: PaymentStatus = 'UNPAID';

  if (paidAmount > 0 && debtAmount > 0) {
    paymentStatus = 'PARTIAL';
  }

  if (paidAmount > 0 && debtAmount === 0) {
    paymentStatus = 'PAID';
  }

  return {
    ...order,
    paidAmount,
    debtAmount,
    paymentStatus,
  };
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(
    tenantId: string,
    userId: string,
    role: Role,
    customerId?: string,
  ) {
    const where: Prisma.OrderWhereInput = {
      tenantId,
      ...(role === Role.SALES ? { createdById: userId } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const orders = await this.prisma.order.findMany({
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
        items: {
          include: {
            product: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map(addPaymentSummary);
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
        items: {
          include: {
            product: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return addPaymentSummary(order);
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

    const items: PreparedOrderItem[] = [];

    for (const item of dto.items) {
      if (item.quantity <= 0) {
        throw new BadRequestException('Item quantity must be greater than 0');
      }

      if (item.productId) {
        const product = await this.prisma.product.findFirst({
          where: {
            id: item.productId,
            tenantId,
            isActive: true,
          },
        });

        if (!product) {
          throw new NotFoundException('Product not found or inactive');
        }

        items.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          price: product.price,
          total: item.quantity * product.price,
        });

        continue;
      }

      if (!item.productName || item.price === undefined) {
        throw new BadRequestException(
          'Manual item must have productName and price',
        );
      }

      if (item.price < 0) {
        throw new BadRequestException('Item price cannot be negative');
      }

      items.push({
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        total: item.quantity * item.price,
      });
    }

    const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
    const paidAmount = dto.paidAmount ?? 0;

    if (paidAmount > totalAmount) {
      throw new BadRequestException(
        'Paid amount cannot be greater than total amount',
      );
    }

    const debtAmount = totalAmount - paidAmount;

    const order = await this.prisma.order.create({
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
        items: {
          include: {
            product: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    return addPaymentSummary(order);
  }

  async addPayment(
    tenantId: string,
    userId: string,
    role: Role,
    orderId: string,
    dto: CreatePaymentDto,
  ) {
    this.ensureRoleCanAddPayment(role);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId,
        ...(role === Role.SALES ? { createdById: userId } : {}),
      },
      include: {
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const current = addPaymentSummary(order);

    if (current.debtAmount <= 0) {
      throw new BadRequestException('Order debt is already closed');
    }

    if (dto.amount > current.debtAmount) {
      throw new BadRequestException(
        'Payment amount cannot be greater than current debt',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          tenantId,
          orderId: order.id,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod ?? 'cash',
        },
      });

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          debtAmount: current.debtAmount - dto.amount,
        },
      });
    });

    const updatedOrder = await this.prisma.order.findUnique({
      where: {
        id: order.id,
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
        items: {
          include: {
            product: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!updatedOrder) {
      throw new NotFoundException('Order not found');
    }

    return addPaymentSummary(updatedOrder);
  }

  async updateOrderStatus(
    tenantId: string,
    role: Role,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === dto.status) {
      throw new BadRequestException('Order already has this status');
    }

    const nextStatuses = allowedNextStatuses[order.status];

    if (!nextStatuses.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} → ${dto.status}`,
      );
    }

    this.ensureRoleCanMoveToStatus(role, dto.status);

    const updatedOrder = await this.prisma.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: dto.status,
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
        items: {
          include: {
            product: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    return addPaymentSummary(updatedOrder);
  }

  private ensureRoleCanMoveToStatus(role: Role, nextStatus: OrderStatus) {
    if (role === Role.OWNER || role === Role.MANAGER) {
      return;
    }

    const allowedStatusesByRole: Partial<Record<Role, OrderStatus[]>> = {
      OPERATOR: [OrderStatus.CHECKED, OrderStatus.CONFIRMED],
      WAREHOUSE: [OrderStatus.PREPARING, OrderStatus.SHIPPED],
      DELIVERY: [OrderStatus.DELIVERED],
    };

    const allowedStatuses = allowedStatusesByRole[role] ?? [];

    if (!allowedStatuses.includes(nextStatus)) {
      throw new ForbiddenException(
        `Role ${role} cannot move order to ${nextStatus}`,
      );
    }
  }

  private ensureRoleCanAddPayment(role: Role) {
    const allowedRoles = [Role.OWNER, Role.MANAGER, Role.SALES, Role.OPERATOR];

    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException(`Role ${role} cannot add payment`);
    }
  }
}
