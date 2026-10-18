import {
  Body,
  Controller,
  ForbiddenException,
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
import type { Request } from '../common/http-types';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BillingExempt } from './billing-exempt.decorator';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { SyncBillingDto } from './dto/sync-billing.dto';
import { PlansService } from './plans.service';
import { ReconciliationService } from './reconciliation.service';
import { PaymentsService } from './payments.service';
import { SubscriptionsService } from './subscriptions.service';
import {
  canUseProductionTestCheckout,
  PRODUCTION_TEST_PLAN_SLUG,
} from './production-test-access';

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
    private readonly payments: PaymentsService,
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

  @Post('subscription/cancel')
  @UseGuards(CsrfOriginGuard)
  async cancelSubscription(
    @Req() req: Request,
    @Body() _body: CancelSubscriptionDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    const context = await this.tenantContext.resolve(req.user, {
      selectedBranchId: branchId,
      writable: true,
      allowedRoles: [Role.Admin],
      allowDevSupport: devContext?.toLowerCase() === 'support',
    });
    return {
      ok: true,
      subscription: await this.subscriptions.cancelForTenant(context.tenantId),
    };
  }

  @Get('production-test-capability')
  async productionTestCapability(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return {
      ok: true,
      enabled: await this.checkouts.productionTestCheckoutAvailable(
        req.user,
        branchId,
        devContext,
      ),
    };
  }

  @Post('production-test-checkout')
  @UseGuards(CsrfOriginGuard)
  productionTestCheckout(
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    if (!canUseProductionTestCheckout(req.user)) {
      throw new ForbiddenException(
        'Teste de produção não autorizado para este administrador.',
      );
    }
    return this.checkouts.create(
      req.user,
      PRODUCTION_TEST_PLAN_SLUG,
      idempotencyKey,
      branchId,
      devContext,
    );
  }

  @Post('checkout')
  @UseGuards(CsrfOriginGuard)
  createCheckout(
    @Req() req: Request,
    @Body() body: CreateCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.checkouts.create(
      req.user,
      body.planSlug,
      idempotencyKey,
      branchId,
      devContext,
      body.promotionReservationId,
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

  @Get('production-test-refund-capability')
  async productionTestRefundCapability(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    if (!canUseProductionTestCheckout(req.user)) {
      return { ok: true, enabled: false, amountCents: null, currency: null };
    }
    const context = await this.tenantContext.resolve(req.user, {
      selectedBranchId: branchId,
      writable: true,
      allowedRoles: [Role.Admin],
      allowDevSupport: devContext?.toLowerCase() === 'support',
    });
    return {
      ok: true,
      ...(await this.payments.productionTestRefundCapability(context.tenantId)),
    };
  }

  @Get('production-test-refund-diagnostic')
  async productionTestRefundDiagnostic(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    if (!canUseProductionTestCheckout(req.user)) {
      throw new ForbiddenException(
        'Diagnóstico do estorno de teste não autorizado para este administrador.',
      );
    }
    const context = await this.tenantContext.resolve(req.user, {
      selectedBranchId: branchId,
      writable: true,
      allowedRoles: [Role.Admin],
      allowDevSupport: devContext?.toLowerCase() === 'support',
    });
    return {
      ok: true,
      requestId: req.requestId ?? null,
      diagnostic: await this.payments.productionTestRefundDiagnostic(
        context.tenantId,
      ),
    };
  }

  @Post('production-test-refund')
  @UseGuards(CsrfOriginGuard)
  async refundProductionTest(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    if (!canUseProductionTestCheckout(req.user)) {
      throw new ForbiddenException(
        'Estorno do teste de produção não autorizado para este administrador.',
      );
    }
    const context = await this.tenantContext.resolve(req.user, {
      selectedBranchId: branchId,
      writable: true,
      allowedRoles: [Role.Admin],
      allowDevSupport: devContext?.toLowerCase() === 'support',
    });
    const capability = await this.payments.productionTestRefundCapability(
      context.tenantId,
    );
    if (!capability.enabled) {
      throw new ForbiddenException(
        'Não existe estorno de teste de produção disponível para este tenant.',
      );
    }
    return {
      ok: true,
      subscription: await this.subscriptions.cancelForTenant(context.tenantId),
      result: await this.payments.refundProductionTestForTenant(
        context.tenantId,
      ),
    };
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
