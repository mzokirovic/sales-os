import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts(tenantId: string) {
    return this.prisma.product.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  listActiveProducts(tenantId: string) {
    return this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async createProduct(tenantId: string, dto: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: {
          tenantId,
          name: dto.name,
          sku: dto.sku,
          unit: dto.unit ?? 'dona',
          price: dto.price,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product with this name already exists');
      }

      throw error;
    }
  }

  async updateProduct(
    tenantId: string,
    productId: string,
    dto: UpdateProductDto,
  ) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tenantId,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    try {
      return await this.prisma.product.update({
        where: {
          id: product.id,
        },
        data: {
          name: dto.name,
          sku: dto.sku,
          unit: dto.unit,
          price: dto.price,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product with this name already exists');
      }

      throw error;
    }
  }
}
