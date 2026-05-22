import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateModeDto } from './dto/update-mode.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseGuards(OptionalJwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('company')
  getCompany(@Req() req: Request) {
    return this.profileService.getCompany(req.user);
  }

  @Patch('company')
  updateCompany(@Req() req: Request, @Body() body: UpdateCompanyDto) {
    return this.profileService.updateCompany(req.user, body);
  }

  @Get('plans')
  listPlans() {
    return this.profileService.listPlans();
  }

  @Patch('plan')
  updatePlan(@Req() req: Request, @Body() body: UpdatePlanDto) {
    return this.profileService.updatePlan(req.user, body.planSlug);
  }

  @Get('mode')
  getMode(@Req() req: Request) {
    return this.profileService.getMode(req.user);
  }

  @Patch('mode')
  updateMode(@Req() req: Request, @Body() body: UpdateModeDto) {
    return this.profileService.updateMode(req.user, body.mode);
  }
}
