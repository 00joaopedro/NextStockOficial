import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecordUsageEventDto } from './dto/record-usage-event.dto';
import { UsageService } from './usage.service';

@Controller('usage')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Post('page-view')
  @UseGuards(JwtAuthGuard)
  async recordPageView(@Req() request: Request, @Body() body: RecordUsageEventDto) {
    await this.usageService.record({
      user: request.user,
      eventType: body.eventType || 'page_view',
      page: body.page,
      route: request.originalUrl || request.url,
      method: request.method,
      weight: 1,
    });

    return { ok: true };
  }
}
