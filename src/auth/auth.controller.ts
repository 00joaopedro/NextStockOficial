import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Optional,
} from '@nestjs/common';
import { AuditOutcome, AuditSeverity } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  PublicRateLimitGuard,
  RateLimit,
} from '../security/public-rate-limit.guard';
import { CsrfExempt } from '../security/csrf-origin.guard';
import { BillingExempt } from '../billing/billing-exempt.decorator';
import { AuditService } from '../audit/audit.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  clearAuthCookies,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from '../sessions/session-cookie';

import type {
  AuthenticatedHttpRequest,
  CompatibleReply,
} from '../common/http-types';

@Controller('auth')
@BillingExempt()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly sessions?: SessionsService,
  ) {}

  @Post('register')
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 8, windowMs: 60_000, includeEmail: true })
  @CsrfExempt()
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) reply: CompatibleReply,
    @Req() req?: AuthenticatedHttpRequest,
  ) {
    const { accessToken, payload } = await this.authService.register(body);

    reply.header('Cache-Control', 'no-store');
    await this.createSession(req, reply, accessToken, payload.user);
    this.setJwtCookie(reply, accessToken);
    void this.audit?.record({
      ...this.audit.fromRequest(req),
      eventType: 'auth.register.succeeded',
      action: 'register',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.MEDIUM,
      actorProfileId: payload.user?.id,
      tenantId: payload.selectedBranch?.tenantId,
      branchId: payload.selectedBranch?.id,
    });

    return payload;
  }

  @Post('login')
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 5, windowMs: 60_000, includeEmail: true })
  @CsrfExempt()
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) reply: CompatibleReply,
    @Req() req?: AuthenticatedHttpRequest,
  ) {
    try {
      const { accessToken, payload } = await this.authService.login(body);

      reply.header('Cache-Control', 'no-store');
      await this.createSession(req, reply, accessToken, payload.user);
      this.setJwtCookie(reply, accessToken);
      void this.audit?.record({
        ...this.audit.fromRequest(req),
        eventType: 'auth.login.succeeded',
        action: 'login',
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.LOW,
        actorProfileId: payload.user?.id,
        actorRole: payload.user?.role,
        tenantId: payload.selectedBranch?.tenantId,
        branchId: payload.selectedBranch?.id,
      });

      return payload;
    } catch (error) {
      void this.audit?.record({
        ...this.audit.fromRequest(req),
        eventType: 'auth.login.failed',
        action: 'login',
        outcome: AuditOutcome.DENIED,
        severity: AuditSeverity.MEDIUM,
        reasonCode: 'INVALID_CREDENTIALS_OR_PROVIDER_FAILURE',
        metadata: { emailHashOnly: true },
      });
      throw error;
    }
  }

  @Post('forgot-password')
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 5, windowMs: 3_600_000, includeEmail: true })
  @CsrfExempt()
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
    @Req() req: AuthenticatedHttpRequest,
  ) {
    const result = await this.authService.forgotPassword(body);
    void this.audit?.record({
      ...this.audit.fromRequest(req),
      eventType: 'auth.password_recovery.requested',
      action: 'forgot_password',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.MEDIUM,
    });
    return result;
  }

  @Post('logout')
  async logout(
    @Res({ passthrough: true }) reply: CompatibleReply,
    @Req() req: AuthenticatedHttpRequest,
  ) {
    await this.sessions?.revokeCurrent(
      req.cookies?.[SESSION_COOKIE_NAME],
      'logout',
      this.sessions.metadataFromRequest(req),
    );
    clearAuthCookies(reply);
    reply.header('Cache-Control', 'no-store');
    void this.audit?.record({
      ...this.audit.fromRequest(req),
      eventType: 'auth.logout',
      action: 'logout',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.LOW,
    });
    return { ok: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @Res({ passthrough: true }) reply: CompatibleReply,
    @Req() req: AuthenticatedHttpRequest,
  ) {
    const revoked = await this.sessions?.revokeAllForProfile(
      req.user!.id,
      'logout_all',
      this.sessions.metadataFromRequest(req),
    );
    clearAuthCookies(reply);
    reply.header('Cache-Control', 'no-store');
    return { ok: true, revoked: revoked ?? 0 };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  profile(
    @Req() req: AuthenticatedHttpRequest,
    @Res({ passthrough: true }) reply?: CompatibleReply,
  ) {
    reply?.header('Cache-Control', 'no-store');
    return this.authService.getProfile(req.user);
  }

  private setJwtCookie(reply: CompatibleReply, accessToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const maxAge = this.getJwtMaxAgeMs(accessToken);

    reply.setCookie('jwt', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      ...(maxAge ? { maxAge } : {}),
    });
  }

  private async createSession(
    req: AuthenticatedHttpRequest | undefined,
    reply: CompatibleReply,
    accessToken: string,
    user: { id: string; tenantId?: string | null },
  ) {
    if (!this.sessions) return;
    const token = this.sessions.expiresAtFromJwt(accessToken);
    const session = await this.sessions.create({
      profileId: user.id,
      tenantId: user.tenantId,
      jwtSubject: token.subject,
      expiresAt: token.expiresAt,
      metadata: this.sessions.metadataFromRequest(req),
    });
    setSessionCookie(reply, session.token, session.expiresAt);
    reply.header('Cache-Control', 'no-store');
  }

  private getJwtMaxAgeMs(accessToken: string) {
    try {
      const [, payload] = accessToken.split('.');

      if (!payload) {
        return undefined;
      }

      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        '=',
      );
      const decoded = JSON.parse(
        Buffer.from(padded, 'base64').toString('utf8'),
      ) as {
        exp?: number;
      };

      if (!decoded.exp) {
        return undefined;
      }

      const maxAge = decoded.exp * 1000 - Date.now();

      return maxAge > 0 ? maxAge : undefined;
    } catch {
      return undefined;
    }
  }
}
