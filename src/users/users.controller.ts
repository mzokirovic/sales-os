import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.OWNER, Role.MANAGER)
  listUsers(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.listByTenant(user.tenantId);
  }

  @Post()
  @Roles(Role.OWNER, Role.MANAGER)
  createUser(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.createEmployee(user.tenantId, user.role, dto);
  }
}
