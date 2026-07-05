import { Controller, Get, Headers, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { SystemContextResponseDto } from './dto/system-context-response.dto';
import { SystemService } from './system.service';
import { BillingExempt } from '../billing/billing-exempt.decorator';

@Controller('system')
@BillingExempt()
@UseGuards(OptionalJwtAuthGuard)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('context')
  getContext(
    @Req() request: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ): Promise<SystemContextResponseDto> | SystemContextResponseDto {
    return this.systemService.getContext(
      request.user,
      selectedBranchId,
      devContextMode,
    );
  }

  @Get('pages')
  @UseGuards(JwtAuthGuard, DevSuperAdminGuard)
  getPages() {
    return this.systemService.listPublicHtmlPages();
  }
}
