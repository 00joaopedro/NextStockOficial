import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(Role.Admin)
  list(@Req() req: Request) {
    return this.tenantsService.list(req.user);
  }

  @Get('current')
  current(@Req() req: Request) {
    return this.tenantsService.getCurrent(req.user);
  }

  @Patch('current')
  @Roles(Role.Admin)
  updateCurrent(
    @Req() req: Request,
    @Body() body: { name?: string; slug?: string },
  ) {
    return this.tenantsService.updateCurrent(req.user, body);
  }
}
