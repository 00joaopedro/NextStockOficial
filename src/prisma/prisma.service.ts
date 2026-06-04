import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { configurePrismaRuntimeUrl } from './database-url.util';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const datasourceUrl = configurePrismaRuntimeUrl(process.env.DATABASE_URL);

    super(datasourceUrl ? { datasourceUrl } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
  }
}
