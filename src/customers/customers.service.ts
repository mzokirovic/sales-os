import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  listCustomers(tenantId: string, userId: string, role: Role) {
    const where =
      role === Role.SALES
        ? { tenantId, createdById: userId }
        : { tenantId };

    return this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        createdById: true,
        name: true,
        phone: true,
        address: true,
        lat: true,
        lng: true,
        note: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createCustomer(
    tenantId: string,
    createdById: string,
    dto: CreateCustomerDto,
  ) {
    return this.prisma.customer.create({
      data: {
        tenantId,
        createdById,
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
        note: dto.note,
      },
      select: {
        id: true,
        tenantId: true,
        createdById: true,
        name: true,
        phone: true,
        address: true,
        lat: true,
        lng: true,
        note: true,
        createdAt: true,
      },
    });
  }

  async getCustomerById(
    tenantId: string,
    userId: string,
    role: Role,
    customerId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId,
        ...(role === Role.SALES ? { createdById: userId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        createdById: true,
        name: true,
        phone: true,
        address: true,
        lat: true,
        lng: true,
        note: true,
        createdAt: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }
}