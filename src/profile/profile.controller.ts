import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateModeDto } from './dto/update-mode.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('company')
  getCompany(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.profileService.getCompany(req.user, selectedBranchId);
  }

  @Patch('company')
  @Roles(Role.Admin)
  updateCompany(
    @Req() req: Request,
    @Body() body: UpdateCompanyDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.profileService.updateCompany(req.user, body, selectedBranchId);
  }

  @Get('plans')
  listPlans() {
    return this.profileService.listPlans();
  }

  @Patch('plan')
  @Roles(Role.Admin)
  updatePlan(
    @Req() req: Request,
    @Body() body: UpdatePlanDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.profileService.updatePlan(req.user, body.planSlug, selectedBranchId);
  }

  @Get('mode')
  getMode(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.profileService.getMode(req.user, selectedBranchId);
  }

  @Patch('mode')
  @Roles(Role.Admin)
  updateMode(
    @Req() req: Request,
    @Body() body: UpdateModeDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.profileService.updateMode(req.user, body.mode, selectedBranchId);
  }
}
