import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type UsageEventType =
  | 'login'
  | 'register'
  | 'profile'
  | 'page_view'
  | 'products_list'
  | 'product_create'
  | 'product_update'
  | 'product_delete'
  | 'product_image_upload'
  | string;

type UsageRecordInput = {
  user?: AuthenticatedUser | null;
  userId?: string | null;
  tenantId?: string | null;
  branchId?: string | null;
  email?: string | null;
  name?: string | null;
  systemType?: string | null;
  branchName?: string | null;
  eventType: UsageEventType;
  page?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  weight?: number | null;
  dbReadCount?: number | null;
  dbWriteCount?: number | null;
  responseBytes?: number | null;
  metadata?: Record<string, unknown> | null;
};

export const USAGE_EVENT_WEIGHTS: Record<string, number> = {
  login: 1,
  register: 2,
  profile: 1,
  page_view: 1,
  products_list: 2,
  product_create: 5,
  product_update: 4,
  product_delete: 4,
  product_image_upload: 10,
};

function shouldIgnoreUsageWriteError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; meta?: unknown };
  const message = `${candidate?.message ?? ''} ${JSON.stringify(candidate?.meta ?? {})}`.toLowerCase();

  return (
    candidate?.code === 'P2021' ||
    candidate?.code === 'P2022' ||
    message.includes('user_usage_events')
  );
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  getWeight(eventType: UsageEventType, override?: number | null) {
    if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
      return Math.round(override);
    }

    return USAGE_EVENT_WEIGHTS[eventType] ?? 1;
  }

  async record(input: UsageRecordInput) {
    const user = input.user;
    const userId = input.userId ?? user?.id;

    if (!userId) {
      return null;
    }

    try {
      return await (this.prisma as any).userUsageEvent.create({
        data: {
          userId,
          tenantId: input.tenantId ?? user?.tenantId ?? null,
          branchId: input.branchId ?? user?.branchId ?? null,
          email: input.email ?? user?.email ?? null,
          name: input.name ?? user?.name ?? null,
          systemType: input.systemType ?? user?.systemType ?? null,
          branchName: input.branchName ?? user?.branch?.name ?? null,
          eventType: input.eventType,
          page: input.page ?? null,
          route: input.route ?? null,
          method: input.method ?? null,
          statusCode: input.statusCode ?? null,
          durationMs: input.durationMs ?? null,
          weight: this.getWeight(input.eventType, input.weight),
          dbReadCount: input.dbReadCount ?? 0,
          dbWriteCount: input.dbWriteCount ?? 0,
          responseBytes: input.responseBytes ?? null,
          metadata: input.metadata ?? undefined,
        },
      });
    } catch (error) {
      if (shouldIgnoreUsageWriteError(error)) {
        return null;
      }

      return null;
    }
  }
}
