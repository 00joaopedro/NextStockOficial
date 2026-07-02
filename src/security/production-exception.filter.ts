import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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
      this.logger.error(
        `request_failed id=${request.requestId ?? 'unknown'} method=${request.method} path=${request.path} status=${status} error=${name}`,
      );
    }

    if (process.env.NODE_ENV === 'production' && status >= 500) {
      response.status(status).json({
        statusCode: status,
        message: 'Erro interno do servidor.',
        requestId: request.requestId,
      });
      return;
    }

    const body =
      typeof safeResponse === 'string' ? { message: safeResponse } : safeResponse;
    response.status(status).json({
      ...(body as object),
      statusCode: status,
      requestId: request.requestId,
    });
  }
}
