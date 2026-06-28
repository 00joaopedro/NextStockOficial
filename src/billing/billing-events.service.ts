import { Injectable } from '@nestjs/common';
import { BillingEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingEventsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: {
      tenantId?: string | null;
      subscriptionId?: string | null;
      paymentId?: string | null;
      checkoutSessionId?: string | null;
      type: BillingEventType;
      actorProfileId?: string | null;
      source: string;
      previousState?: Prisma.InputJsonValue;
      nextState?: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
    },
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.billingEvent.create({ data });
  }
}
