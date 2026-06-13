import { Injectable } from '@nestjs/common';
import { FiscalEnvironment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FiscalSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async allocate(input: {
    tenantId: string;
    branchId: string;
    model: string;
    series: string;
    environment: FiscalEnvironment;
  }) {
    return this.prisma.$transaction(async (tx) =>
      this.allocateWithClient(tx, input),
    );
  }

  async allocateWithClient(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      model: string;
      series: string;
      environment: FiscalEnvironment;
    },
  ) {
    const sequence = await tx.fiscalSequence.upsert({
      where: {
        tenantId_branchId_model_series_environment: input,
      },
      create: {
        ...input,
        nextNumber: 2,
      },
      update: {
        nextNumber: { increment: 1 },
      },
      select: { nextNumber: true },
    });

    return sequence.nextNumber - 1;
  }
}
