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
  UnauthorizedException,
} from '@nestjs/common';
import { AuditOutcome, AuditSeverity } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordLifecycleService } from './password-lifecycle.service';
import { authProviderMode } from './auth-provider-mode';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RateLimit } from '../security/public-rate-limit.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
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
import { GoogleOAuthService } from './google-oauth.service';

@Controller('auth')
@BillingExempt()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly sessions?: SessionsService,
    @Optional() private readonly passwordLifecycle?: PasswordLifecycleService,
    @Optional() private readonly googleOAuth?: GoogleOAuthService,
  ) {}

  @Get('google/start')
  @UseGuards(AuthRateLimitGuard)
  @RateLimit({ max: 10, windowMs: 60_000 })
  @CsrfExempt()
  async googleStart(@Req() req: AuthenticatedHttpRequest, @Res() reply: CompatibleReply) {
    const url = await this.googleOAuth!.start('login');
    reply.redirect(url);
  }

  @Get('google/link/start')
  @UseGuards(JwtAuthGuard, AuthRateLimitGuard)
  @RateLimit({ max: 5, windowMs: 60_000 })
  async googleLinkStart(@Req() req: AuthenticatedHttpRequest, @Res() reply: CompatibleReply) {
    const sessionId = await this.sessions?.findActiveId(req.cookies?.[SESSION_COOKIE_NAME], req.user!.id);
    if (!sessionId) throw new UnauthorizedException('Active session required.');
    const url = await this.googleOAuth!.start('link', req.user!.id, sessionId);
    reply.redirect(url);
  }

  @Get('google/callback')
  @CsrfExempt()
  async googleCallback(@Req() req: AuthenticatedHttpRequest, @Res() reply: CompatibleReply) {
    const query = req.query as { code?: string; state?: string };
    const result = await this.googleOAuth!.callback(query.code || '', query.state || '');
    if (result.accessToken) {
      await this.createSession(req, reply, result.accessToken, result.user);
      this.setJwtCookie(reply, result.accessToken);
    }
    reply.redirect(result.redirectTo);
  }

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
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
  @UseGuards(AuthRateLimitGuard)
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
  @UseGuards(AuthRateLimitGuard)
  @RateLimit({ max: 5, windowMs: 3_600_000, includeEmail: true })
  @CsrfExempt()
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
    @Req() req: AuthenticatedHttpRequest,
  ) {
    const result =
      authProviderMode() === 'coexistence' &&
      process.env.LOCAL_PASSWORD_RECOVERY_ENABLED === 'true' &&
      this.passwordLifecycle
        ? await this.passwordLifecycle.request(body.email.trim().toLowerCase())
        : await this.authService.forgotPassword(body);
    void this.audit?.record({
      ...this.audit.fromRequest(req),
      eventType: 'auth.password_recovery.requested',
      action: 'forgot_password',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.MEDIUM,
    });
    return result;
  }

  @Post('reset-password')
  @UseGuards(AuthRateLimitGuard)
  @RateLimit({ max: 5, windowMs: 3_600_000, includeEmail: false })
  @CsrfExempt()
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() req: AuthenticatedHttpRequest,
    @Res({ passthrough: true }) reply: CompatibleReply,
  ) {
    const result = await this.passwordLifecycle!.reset(
      body.token,
      body.newPassword,
    );
    clearAuthCookies(reply);
    reply.header('Cache-Control', 'no-store');
    void this.audit?.record({
      ...this.audit.fromRequest(req),
      eventType: 'auth.password_reset_completed',
      action: 'reset_password',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.HIGH,
    });
    return result;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, AuthRateLimitGuard)
  @RateLimit({ max: 5, windowMs: 3_600_000, includeEmail: false })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: AuthenticatedHttpRequest,
    @Res({ passthrough: true }) reply: CompatibleReply,
  ) {
    const result = await this.passwordLifecycle!.change(
      req.user!.id,
      body.currentPassword,
      body.newPassword,
    );
    clearAuthCookies(reply);
    reply.header('Cache-Control', 'no-store');
    void this.audit?.record({
      ...this.audit.fromRequest(req),
      eventType: 'auth.password_changed',
      action: 'change_password',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.HIGH,
      actorProfileId: req.user!.id,
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
    void this.audit?.record({
      ...this.audit.fromRequest(req),
      eventType: 'auth.logout_all',
      action: 'logout_all',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.MEDIUM,
      actorProfileId: req.user!.id,
      metadata: { revokedCount: revoked ?? 0 },
    });
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
