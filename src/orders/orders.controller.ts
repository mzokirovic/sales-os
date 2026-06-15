import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(
    Role.OWNER,
    Role.MANAGER,
    Role.SALES,
    Role.OPERATOR,
    Role.WAREHOUSE,
    Role.DELIVERY,
  )
  listOrders(
    @CurrentUser() user: CurrentUserPayload,
    @Query('customerId') customerId?: string,
  ) {
    return this.ordersService.listOrders(
      user.tenantId,
      user.userId,
      user.role,
      customerId,
    );
  }

  @Get(':id')
  @Roles(
    Role.OWNER,
    Role.MANAGER,
    Role.SALES,
    Role.OPERATOR,
    Role.WAREHOUSE,
    Role.DELIVERY,
  )
  getOrder(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.getOrderById(
      user.tenantId,
      user.userId,
      user.role,
      orderId,
    );
  }

  @Post()
  @Roles(Role.OWNER, Role.MANAGER, Role.SALES, Role.OPERATOR)
  createOrder(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(
      user.tenantId,
      user.userId,
      user.role,
      dto,
    );
  }

  @Post(':id/payments')
  @Roles(Role.OWNER, Role.MANAGER, Role.SALES, Role.OPERATOR)
  addPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') orderId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.ordersService.addPayment(
      user.tenantId,
      user.userId,
      user.role,
      orderId,
      dto,
    );
  }

  @Patch(':id/status')
  @Roles(Role.OWNER, Role.MANAGER, Role.OPERATOR, Role.WAREHOUSE, Role.DELIVERY)
  updateOrderStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(
      user.tenantId,
      user.role,
      orderId,
      dto,
    );
  }
}
