import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateDeliveryTripDto } from './dto/create-delivery-trip.dto';
import { DeliveryService } from './delivery.service';

@Controller('delivery')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('ready-orders')
  @Roles(Role.OWNER, Role.MANAGER, Role.OPERATOR, Role.WAREHOUSE)
  listReadyOrders(@CurrentUser() user: CurrentUserPayload) {
    return this.deliveryService.listReadyOrders(user.tenantId);
  }

  @Get('drivers')
  @Roles(Role.OWNER, Role.MANAGER, Role.OPERATOR, Role.WAREHOUSE)
  listDrivers(@CurrentUser() user: CurrentUserPayload) {
    return this.deliveryService.listDrivers(user.tenantId);
  }

  @Post('trips')
  @Roles(Role.OWNER, Role.MANAGER, Role.OPERATOR)
  createTrip(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateDeliveryTripDto,
  ) {
    return this.deliveryService.createTrip(user.tenantId, user.userId, dto);
  }
}
