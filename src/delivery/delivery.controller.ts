import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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


  @Get('trips')
  @Roles(Role.OWNER, Role.MANAGER, Role.OPERATOR, Role.WAREHOUSE)
  listTrips(@CurrentUser() user: CurrentUserPayload) {
    return this.deliveryService.listTrips(user.tenantId);
  }

  @Get('trips/my')
  @Roles(Role.DELIVERY)
  listMyTrips(@CurrentUser() user: CurrentUserPayload) {
    return this.deliveryService.listMyTrips(user.tenantId, user.userId);
  }

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



  @Post('stops/:id/deliver')
  @Roles(Role.DELIVERY)
  deliverStop(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') stopId: string,
  ) {
    return this.deliveryService.deliverStop(user.tenantId, user.userId, stopId);
  }

  @Post('trips/:id/start')
  @Roles(Role.DELIVERY)
  startTrip(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') tripId: string,
  ) {
    return this.deliveryService.startTrip(user.tenantId, user.userId, tripId);
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
