import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { PartnerQueryDto } from './dto/partner-query.dto';
import { ReferralQueryDto } from './dto/referral-query.dto';
import { UpdateLinkStatusDto } from './dto/update-link-status.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { UpdateReferralPaymentDto } from './dto/update-referral-payment.dto';
import { UpdateReferralSeenDto } from './dto/update-referral-seen.dto';
import { PartnerReferralsService } from './partner-referrals.service';
import { PartnersService } from './partners.service';
import { ReferralRegistrationService } from './referral-registration.service';
import { getClientIp, getUserAgent } from '../http/http-adapter.utils';

const strictValidation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@Controller('partners')
@UseGuards(
  JwtAuthGuard,
  DevSuperAdminGuard,
  CsrfOriginGuard,
  PreviewMutationGuard,
)
@UsePipes(strictValidation)
export class PartnersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly referrals: PartnerReferralsService,
  ) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: PartnerQueryDto) {
    return this.partners.findAll(req.user, query);
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreatePartnerDto) {
    return this.partners.create(req.user, body, this.audit(req));
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.partners.findOne(req.user, id);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePartnerDto,
  ) {
    return this.partners.update(req.user, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.partners.remove(req.user, id, this.audit(req));
  }

  @Post(':id/referral-link')
  rotateLink(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.partners.rotateLink(req.user, id, this.audit(req));
  }

  @Patch(':id/referral-link/status')
  updateLinkStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLinkStatusDto,
  ) {
    return this.partners.updateLinkStatus(req.user, id, body, this.audit(req));
  }

  @Get(':id/referrals')
  findReferrals(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ReferralQueryDto,
  ) {
    return this.referrals.findAll(req.user, id, query);
  }

  @Patch(':partnerId/referrals/:referralId/seen')
  updateSeen(
    @Req() req: Request,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('referralId', ParseUUIDPipe) referralId: string,
    @Body() body: UpdateReferralSeenDto,
  ) {
    return this.referrals.updateSeen(req.user, partnerId, referralId, body);
  }

  @Patch(':partnerId/referrals/:referralId/payment-status')
  updatePayment(
    @Req() req: Request,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('referralId', ParseUUIDPipe) referralId: string,
    @Body() body: UpdateReferralPaymentDto,
  ) {
    return this.referrals.updatePayment(req.user, partnerId, referralId, body);
  }

  private audit(req: Request) {
    return {
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    };
  }
}

@Controller('referrals')
@UsePipes(strictValidation)
export class PublicReferralsController {
  constructor(private readonly referrals: ReferralRegistrationService) {}

  @Get(':code/context')
  @UseGuards(PublicRateLimitGuard)
  async context(
    @Param('code') code: string,
    @Headers('cache-control') _cacheControl?: string,
  ) {
    const referral = await this.referrals.resolveActive(code);
    if (!referral) {
      await this.referrals.recordRejected(code);
      throw new NotFoundException(
        'Link de indicacao invalido ou indisponivel.',
      );
    }

    return {
      valid: true,
      systemType: referral.systemType,
    };
  }
}
