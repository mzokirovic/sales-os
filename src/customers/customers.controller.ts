import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(Role.OWNER, Role.MANAGER, Role.SALES, Role.OPERATOR)
  listCustomers(@CurrentUser() user: CurrentUserPayload) {
    return this.customersService.listCustomers(
      user.tenantId,
      user.userId,
      user.role,
    );
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.MANAGER, Role.SALES, Role.OPERATOR)
  getCustomer(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') customerId: string,
  ) {
    return this.customersService.getCustomerById(
      user.tenantId,
      user.userId,
      user.role,
      customerId,
    );
  }

  @Post()
  @Roles(Role.OWNER, Role.MANAGER, Role.SALES)
  createCustomer(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.createCustomer(
      user.tenantId,
      user.userId,
      dto,
    );
  }
}
