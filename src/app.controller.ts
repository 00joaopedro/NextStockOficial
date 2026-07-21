// src/app.controller.ts
import {
  Controller,
  Get,
  Header,
  NotFoundException,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
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
  @Header('Cache-Control', 'no-cache')
  @Header('Content-Type', 'text/html; charset=utf-8')
  devHtml() {
    return this.streamPublicHtml('dev.html');
  }

  @Get('parceiros.html')
  @UseGuards(JwtAuthGuard, DevSuperAdminGuard)
  @Header('Cache-Control', 'no-cache')
  @Header('Content-Type', 'text/html; charset=utf-8')
  partnersHtml() {
    return this.streamPublicHtml('parceiros.html');
  }

  @Get('loja/:slug')
  @Header('Cache-Control', 'no-cache')
  @Header('Content-Type', 'text/html; charset=utf-8')
  storefrontHtml() {
    return this.streamPublicHtml('loja.html');
  }

  private streamPublicHtml(fileName: string) {
    const filePath = join(this.resolvePublicPath(), fileName);

    if (!existsSync(filePath)) {
      throw new NotFoundException(`${fileName} nao encontrado.`);
    }

    return new StreamableFile(createReadStream(filePath));
  }

  private resolvePublicPath() {
    const candidates = [
      join(__dirname, '..', 'public'),
      join(__dirname, '..', '..', 'public'),
      join(process.cwd(), 'public'),
    ];

    return (
      candidates.find((candidate) => existsSync(candidate)) ?? candidates[2]
    );
  }
}
