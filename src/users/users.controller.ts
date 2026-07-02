import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { UpdateTenantUserRoleDto } from './dto/update-tenant-user-role.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.Admin)
  async listAll(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.usersService.list(req.user, selectedBranchId);
  }

  @Post()
  @Roles(Role.Admin)
  async create(
    @Req() req: Request,
    @Body()
    body: CreateTenantUserDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.usersService.create(req.user, body, selectedBranchId);
  }

  @Patch(':userId/role')
  @Roles(Role.Admin)
  async updateRole(
    @Req() req: Request,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateTenantUserRoleDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.usersService.updateRole(req.user, userId, body.role, selectedBranchId);
  }
}
