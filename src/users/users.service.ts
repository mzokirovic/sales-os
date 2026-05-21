import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
  }

  listByTenant(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createEmployee(tenantId: string, dto: CreateUserDto) {
    if (dto.role === Role.OWNER) {
      throw new BadRequestException('OWNER cannot be created from this endpoint');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      throw new ConflictException('User with this phone already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
      },
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
  }
}