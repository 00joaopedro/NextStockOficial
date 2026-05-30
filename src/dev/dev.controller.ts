import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { canAccessDev } from '../auth/super-admin.util';
import { DevService } from './dev.service';
import { DevQueryDto } from './dto/dev-query.dto';

@Controller('dev')
@UseGuards(JwtAuthGuard, DevSuperAdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class DevController {
  constructor(private readonly devService: DevService) {}

  @Get('overview')
  getOverview(@Req() request: Request, @Query() query: DevQueryDto) {
    this.assertDevSuperAdmin(request.user);
    return this.devService.getOverview(query.period || 'today');
  }

  @Get('users-usage')
  getUsersUsage(@Req() request: Request, @Query() query: DevQueryDto) {
    this.assertDevSuperAdmin(request.user);
    return this.devService.getUsersUsage(query.period || 'today', query.search);
  }

  @Get('health')
  getHealth(@Req() request: Request) {
    this.assertDevSuperAdmin(request.user);
    return this.devService.getHealth();
  }

  private assertDevSuperAdmin(user: Express.AuthenticatedUser | undefined) {
    if (!canAccessDev(user)) {
      throw new ForbiddenException('Acesso restrito ao Dev SuperAdmin.');
    }
  }
}
