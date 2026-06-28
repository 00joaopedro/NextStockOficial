// src/app.controller.ts
import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppService } from './app.service';
import { DevSuperAdminGuard } from './auth/dev-super-admin.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Rota simples para testar se a API está viva (funciona no browser)
  @Get()
  health() {
    return {
      status: 'ok',
      app: 'NextStock',
      message: this.appService.getHello(),
    };
  }

  @Get('dev.html')
  @UseGuards(JwtAuthGuard, DevSuperAdminGuard)
  devHtml(@Res() res: Response) {
    return res.sendFile(join(this.resolvePublicPath(), 'dev.html'));
  }

  @Get('parceiros.html')
  @UseGuards(JwtAuthGuard, DevSuperAdminGuard)
  partnersHtml(@Res() res: Response) {
    return res.sendFile(join(this.resolvePublicPath(), 'parceiros.html'));
  }

  private resolvePublicPath() {
    const candidates = [
      join(__dirname, '..', 'public'),
      join(__dirname, '..', '..', 'public'),
      join(process.cwd(), 'public'),
    ];

    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[2];
  }
}
