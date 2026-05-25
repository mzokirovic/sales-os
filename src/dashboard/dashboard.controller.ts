import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Roles(
    Role.OWNER,
    Role.MANAGER,
    Role.SALES,
    Role.OPERATOR,
    Role.WAREHOUSE,
    Role.DELIVERY,
  )
  getSummary(@CurrentUser() user: CurrentUserPayload) {
    return this.dashboardService.getSummary(user.tenantId);
  }
}
