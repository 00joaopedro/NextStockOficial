import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { configurePrismaRuntimeUrl } from './database-url.util';

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 0;

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly slowQueryThresholdMs: number;

  constructor() {
    const datasourceUrl = configurePrismaRuntimeUrl(process.env.DATABASE_URL);
    const slowQueryThresholdMs = parseSlowQueryThreshold(
      process.env.PRISMA_SLOW_QUERY_THRESHOLD_MS,
    );

    super({
      ...(datasourceUrl ? { datasourceUrl } : {}),
      log:
        slowQueryThresholdMs > 0
          ? [{ emit: 'event', level: 'query' }]
          : undefined,
    });

    this.slowQueryThresholdMs = slowQueryThresholdMs;
    this.registerSlowQueryLogger();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private registerSlowQueryLogger() {
    if (this.slowQueryThresholdMs <= 0) {
      return;
    }

    this.$on('query', (event: Prisma.QueryEvent) => {
      if (event.duration < this.slowQueryThresholdMs) {
        return;
      }

      console.warn(
        [
          `[Prisma slow query] ${event.duration}ms`,
          sanitizeQueryForLog(event.query),
          'params=[OMITTED]',
        ].join(' '),
      );
    });
  }
}

function parseSlowQueryThreshold(value?: string): number {
  const parsed = Number(value ?? DEFAULT_SLOW_QUERY_THRESHOLD_MS);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SLOW_QUERY_THRESHOLD_MS;
}

function sanitizeQueryForLog(query: string): string {
  return query.replace(/\s+/g, ' ').trim().slice(0, 2_000);
}
