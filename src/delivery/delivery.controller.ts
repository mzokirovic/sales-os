import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { DeliveryService } from './delivery.service';

@Controller('delivery')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('drivers')
  @Roles(Role.OWNER, Role.MANAGER, Role.OPERATOR, Role.WAREHOUSE)
  listDrivers(@CurrentUser() user: CurrentUserPayload) {
    return this.deliveryService.listDrivers(user.tenantId);
  }
}
