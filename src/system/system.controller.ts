import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { SystemContextResponseDto } from './dto/system-context-response.dto';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('context')
  getContext(@Req() request: Request): SystemContextResponseDto {
    return this.systemService.getContext(request.user);
  }
}
