import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

const OWNER_CREATABLE_ROLES: Role[] = [
  Role.MANAGER,
  Role.SALES,
  Role.OPERATOR,
  Role.WAREHOUSE,
  Role.DELIVERY,
];

const MANAGER_CREATABLE_ROLES: Role[] = [
  Role.SALES,
  Role.OPERATOR,
  Role.WAREHOUSE,
  Role.DELIVERY,
];

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
      orderBy: [
        {
          role: 'asc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async createEmployee(tenantId: string, actorRole: Role, dto: CreateUserDto) {
    const fullName = dto.fullName.trim();
    const phone = dto.phone.trim();
    const password = dto.password.trim();

    if (!fullName) {
      throw new BadRequestException('Full name is required');
    }

    if (!phone) {
      throw new BadRequestException('Phone is required');
    }

    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const allowedRoles = this.getCreatableRoles(actorRole);

    if (!allowedRoles.includes(dto.role)) {
      throw new ForbiddenException(
        `${actorRole} cannot create ${dto.role} users`,
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      throw new ConflictException('User with this phone already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: {
        tenantId,
        fullName,
        phone,
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

  private getCreatableRoles(actorRole: Role): Role[] {
    if (actorRole === Role.OWNER) {
      return OWNER_CREATABLE_ROLES;
    }

    if (actorRole === Role.MANAGER) {
      return MANAGER_CREATABLE_ROLES;
    }

    return [];
  }
}
