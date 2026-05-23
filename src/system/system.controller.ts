import { Controller, Get, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
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
}
