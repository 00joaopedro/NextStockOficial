import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Input = {
  tenantScope: string;
  operation: string;
  targetId: string;
  idempotencyKey: string;
};

@Injectable()
export class AdminOperationService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T extends Record<string, unknown>>(
    input: Input,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<{ result: T; replayed: boolean }> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.idempotencyKey || '')) {
      throw new BadRequestException(
        'Idempotency-Key obrigatória (8-128 caracteres seguros).',
      );
    }

    const replay = async () => {
      const existing = await this.prisma.administrativeOperationExecution.findUnique({
        where: {
          tenantScope_operation_idempotencyKey: {
            tenantScope: input.tenantScope,
            operation: input.operation,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (!existing || existing.targetId !== input.targetId) {
        throw new ConflictException(
          'Idempotency-Key reutilizada para uma operação administrativa diferente.',
        );
      }
      return { result: existing.result as T, replayed: true };
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.administrativeOperationExecution.findUnique({
        where: {
          tenantScope_operation_idempotencyKey: {
            tenantScope: input.tenantScope,
            operation: input.operation,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.targetId !== input.targetId) {
          throw new ConflictException(
            'Idempotency-Key reutilizada para uma operação administrativa diferente.',
          );
        }
        return { result: existing.result as T, replayed: true };
      }

      const result = await action(tx);
      await tx.administrativeOperationExecution.create({
        data: { ...input, result: result as Prisma.InputJsonValue },
      });
      return { result, replayed: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return replay();
      }
      throw error;
    }
  }
}
