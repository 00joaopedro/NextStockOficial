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
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateModeDto } from './dto/update-mode.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ProfileService } from './profile.service';
import { BillingExempt } from '../billing/billing-exempt.decorator';

@Controller('profile')
@BillingExempt()
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@Req() req: Request) {
    return this.profileService.getMe(req.user);
  }

  @Patch('me')
  updateMe(
    @Req() req: Request,
    @Body() body: UpdateMeDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.profileService.updateMe(
      req.user,
      body,
      selectedBranchId,
      devContextMode,
    );
  }

  @Get('company')
  getCompany(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.profileService.getCompany(
      req.user,
      selectedBranchId,
      devContextMode,
    );
  }

  @Patch('company')
  @Roles(Role.Admin)
  updateCompany(
    @Req() req: Request,
    @Body() body: UpdateCompanyDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.profileService.updateCompany(
      req.user,
      body,
      selectedBranchId,
      devContextMode,
    );
  }

  @Get('plans')
  listPlans() {
    return this.profileService.listPlans();
  }

  @Get('subscription')
  getSubscription(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.profileService.getSubscription(
      req.user,
      selectedBranchId,
      devContextMode,
    );
  }

  @Patch('plan')
  @Roles(Role.Admin)
  updatePlan(
    @Req() req: Request,
    @Body() body: UpdatePlanDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.profileService.updatePlan(
      req.user,
      body.planSlug,
      selectedBranchId,
      devContextMode,
    );
  }

  @Get('mode')
  getMode(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.profileService.getMode(req.user, selectedBranchId, devContextMode);
  }

  @Patch('mode')
  @UseGuards(DevSuperAdminGuard)
  updateMode(
    @Req() req: Request,
    @Body() body: UpdateModeDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.profileService.updateMode(
      req.user,
      body.mode,
      selectedBranchId,
      devContextMode,
    );
  }
}
