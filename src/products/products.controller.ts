import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(Role.OWNER, Role.MANAGER, Role.SALES, Role.OPERATOR, Role.WAREHOUSE)
  listProducts(@CurrentUser() user: CurrentUserPayload) {
    return this.productsService.listProducts(user.tenantId);
  }

  @Get('active')
  @Roles(Role.OWNER, Role.MANAGER, Role.SALES, Role.OPERATOR, Role.WAREHOUSE)
  listActiveProducts(@CurrentUser() user: CurrentUserPayload) {
    return this.productsService.listActiveProducts(user.tenantId);
  }

  @Post()
  @Roles(Role.OWNER, Role.MANAGER)
  createProduct(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.MANAGER)
  updateProduct(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(user.tenantId, productId, dto);
  }
}
