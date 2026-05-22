// src/app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Rota simples para testar se a API está viva (funciona no browser)
  @Get('health')
  health() {
    return {
      status: 'ok',
      app: 'NextStock',
      backend: 'online',
    };
  }

  // Exemplo usando AppService (opcional)
  @Get()
  root() {
    return { message: this.appService.getHello() };
  }
}
