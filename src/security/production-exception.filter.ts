import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

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

type FastifyLikeRequest = {
  method?: string;
  url?: string;
  requestId?: string;
};

type FastifyLikeReply = {
  status(statusCode: number): FastifyLikeReply;
  send(body: object): void;
};

type RequestContext = (Request | FastifyLikeRequest) & { requestId?: string };
type ExpressOrFastifyResponse = Response | FastifyLikeReply;

function reply(
  response: ExpressOrFastifyResponse,
  status: number,
  body: object,
) {
  if ('json' in response && typeof response.json === 'function') {
    response.status(status).json(body);
    return;
  }

  response.status(status).send(body);
}

function requestPath(request: RequestContext) {
  return 'path' in request && request.path ? request.path : request.url;
}

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

@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProductionExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<ExpressOrFastifyResponse>();
    const request = context.getRequest<RequestContext>();
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
      reply(response, status, {
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
    reply(response, status, {
      ...(body as object),
      statusCode: status,
      requestId: request.requestId,
    });
  }
}
