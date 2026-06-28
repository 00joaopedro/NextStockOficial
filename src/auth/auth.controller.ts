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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { BillingExempt } from '../billing/billing-exempt.decorator';

@Controller('auth')
@BillingExempt()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(PublicRateLimitGuard)
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, payload } = await this.authService.register(body);

    this.setJwtCookie(res, accessToken);

    return payload;
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, payload } = await this.authService.login(body);

    this.setJwtCookie(res, accessToken);

    return payload;
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jwt', { path: '/' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  profile(@Req() req: Request) {
    return this.authService.getProfile(req.user);
  }

  private setJwtCookie(res: Response, accessToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const maxAge = this.getJwtMaxAgeMs(accessToken);

    res.cookie('jwt', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      ...(maxAge ? { maxAge } : {}),
    });
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
      const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
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
