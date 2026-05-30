import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type SnapshotInput = {
  provider: string;
  metricName: string;
  periodStart: Date;
  periodEnd: Date;
  unit: string;
  source?: string;
  ttlMs?: number;
  load: () => Promise<{ value: number; metadata?: Record<string, unknown> | null }>;
};

function shouldIgnoreSnapshotError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; meta?: unknown };
  const message = `${candidate?.message ?? ''} ${JSON.stringify(candidate?.meta ?? {})}`.toLowerCase();

  return (
    candidate?.code === 'P2021' ||
    candidate?.code === 'P2022' ||
    message.includes('resource_usage_snapshots')
  );
}

@Injectable()
export class ResourceSnapshotsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(input: SnapshotInput) {
    const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
    const freshAfter = new Date(Date.now() - ttlMs);

    try {
      const existing = await (this.prisma as any).resourceUsageSnapshot.findFirst({
        where: {
          provider: input.provider,
          metricName: input.metricName,
          periodStart: input.periodStart,
          createdAt: { gte: freshAfter },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        return {
          value: Number(existing.value),
          metadata: existing.metadata ?? null,
          cached: true,
        };
      }
    } catch (error) {
      if (!shouldIgnoreSnapshotError(error)) {
        throw error;
      }
    }

    const loaded = await input.load();

    try {
      await (this.prisma as any).resourceUsageSnapshot.create({
        data: {
          provider: input.provider,
          metricName: input.metricName,
          value: loaded.value,
          unit: input.unit,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          source: input.source,
          metadata: loaded.metadata ?? undefined,
        },
      });
    } catch (error) {
      if (!shouldIgnoreSnapshotError(error)) {
        throw error;
      }
    }

    return {
      value: loaded.value,
      metadata: loaded.metadata ?? null,
      cached: false,
    };
  }
}
