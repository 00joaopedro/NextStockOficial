import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from '../common/http-types';

const SENSITIVE_META_KEYS = new Set([
  'authorization',
  'cookie',
  'database_url',
  'direct_url',
  'jwt',
  'password',
  'secret',
  'service_role',
  'supabase_service_role_key',
  'token',
]);

function sanitizeMessage(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[REDACTED_JWT]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

function sanitizeMeta(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMeta(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const normalizedKey = key.toLowerCase();
        const isSensitive = [...SENSITIVE_META_KEYS].some((sensitive) =>
          normalizedKey.includes(sensitive),
        );

        return [key, isSensitive ? '[REDACTED]' : sanitizeMeta(item)];
      }),
    );
  }

  if (typeof value === 'string') {
    return sanitizeMessage(value);
  }

  return value;
}

function findPrismaKnownError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error;
  }

  const cause = error instanceof Error ? error.cause : undefined;

  if (cause instanceof Prisma.PrismaClientKnownRequestError) {
    return cause;
  }

  return null;
}

function requestPath(request: Request): string {
  const candidate =
    request.route?.path || request.path || request.originalUrl || request.url;
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.split('?')[0]
    : 'unknown';
}

@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProductionExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const safeResponse =
      error instanceof HttpException
        ? error.getResponse()
        : { message: 'Erro interno do servidor.' };

    if (status >= 500) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      const prismaError = findPrismaKnownError(error);
      const prismaDetails = prismaError
        ? ` code=${prismaError.code} clientVersion=${prismaError.clientVersion} meta=${JSON.stringify(sanitizeMeta(prismaError.meta ?? {}))} message="${sanitizeMessage(prismaError.message)}"`
        : '';

      this.logger.error(
        `request_failed id=${request.requestId ?? 'unknown'} method=${request.method} path=${requestPath(request)} status=${status} error=${name}${prismaDetails}`,
      );
    }

    if (process.env.NODE_ENV === 'production' && status >= 500) {
      response.status(status).send({
        statusCode: status,
        message: 'Erro interno do servidor.',
        requestId: request.requestId,
      });
      return;
    }

    const body =
      typeof safeResponse === 'string'
        ? { message: safeResponse }
        : safeResponse;
    response.status(status).send({
      ...(body as object),
      statusCode: status,
      requestId: request.requestId,
    });
  }
}
