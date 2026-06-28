import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BillingExempt } from './billing-exempt.decorator';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { SyncBillingDto } from './dto/sync-billing.dto';
import { PlansService } from './plans.service';
import { ReconciliationService } from './reconciliation.service';
import { SubscriptionsService } from './subscriptions.service';

@Controller('billing')
@BillingExempt()
@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class BillingController {
  constructor(
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly checkouts: CheckoutService,
    private readonly reconciliation: ReconciliationService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('plans')
  async listPlans() {
    return { ok: true, plans: await this.plans.list() };
  }

  @Get('subscription')
  async subscription(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    const context = await this.tenantContext.resolve(req.user, {
      selectedBranchId: branchId,
      allowDevSupport: devContext?.toLowerCase() === 'support',
    });
    return {
      ok: true,
      ...(await this.subscriptions.getForTenant(context.tenantId)),
    };
  }

  @Post('checkout')
  @UseGuards(CsrfOriginGuard)
  createCheckout(
    @Req() req: Request,
    @Body() body: CreateCheckoutDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.checkouts.create(
      req.user,
      body.planSlug,
      branchId,
      devContext,
    );
  }

  @Get('checkout/:id/status')
  checkoutStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.checkouts.status(req.user, id, branchId, devContext);
  }

  @Post('sync')
  @UseGuards(CsrfOriginGuard, PublicRateLimitGuard)
  sync(
    @Req() req: Request,
    @Body() body: SyncBillingDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.reconciliation.sync(
      req.user,
      body.checkoutId,
      branchId,
      devContext,
    );
  }

  @Get('checkout/return')
  @Redirect('/perfil.html?billingReturn=success', 302)
  checkoutReturn(@Query() _query: Record<string, string>) {}

  @Get('checkout/pending')
  @Redirect('/perfil.html?billingReturn=pending', 302)
  checkoutPending() {}

  @Get('checkout/failure')
  @Redirect('/perfil.html?billingReturn=failure', 302)
  checkoutFailure() {}
}
