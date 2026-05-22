// src/app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

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

}
