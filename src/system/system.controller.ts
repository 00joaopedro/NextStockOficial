import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { isSuperAdmin } from '../auth/super-admin.util';
import { SystemContextResponseDto } from './dto/system-context-response.dto';
import { SystemService } from './system.service';

@Controller('system')
@UseGuards(OptionalJwtAuthGuard)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('context')
  getContext(@Req() request: Request): SystemContextResponseDto {
    return this.systemService.getContext(request.user);
  }

  @Get('pages')
  getPages(@Req() request: Request) {
    if (!isSuperAdmin(request.user)) {
      throw new ForbiddenException('Developer pages are restricted to superAdmin users.');
    }

    return this.systemService.listPublicHtmlPages();
  }
}
