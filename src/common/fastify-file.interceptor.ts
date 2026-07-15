import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Type,
  mixin,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

type FastifyMultipartFile = {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  fields?: Record<string, unknown>;
  toBuffer(): Promise<Buffer>;
};

type FastifyMultipartRequest = {
  file?: (options?: {
    limits?: FastifyFileLimits;
  }) => Promise<FastifyMultipartFile | undefined>;
  body?: Record<string, unknown>;
};

type FastifyFileLimits = {
  fileSize?: number;
  files?: number;
};

type FastifyFileInterceptorOptions = {
  limits?: FastifyFileLimits;
};

type UploadedFastifyFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

export function FastifyFileInterceptor(
  fieldName: string,
  options: FastifyFileInterceptorOptions = {},
): Type<NestInterceptor> {
  @Injectable()
  class MixinFastifyFileInterceptor implements NestInterceptor {
    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const request = context
        .switchToHttp()
        .getRequest<FastifyMultipartRequest & Record<string, unknown>>();

      if (typeof request.file !== 'function') {
        throw new BadRequestException('Multipart parser is not available.');
      }

      const multipartFile = await request.file({ limits: options.limits });
      if (!multipartFile || multipartFile.fieldname !== fieldName) {
        throw new BadRequestException(
          `File field \"${fieldName}\" is required.`,
        );
      }

      const buffer = await multipartFile.toBuffer();
      const uploadedFile: UploadedFastifyFile = {
        fieldname: multipartFile.fieldname,
        originalname: multipartFile.filename,
        encoding: multipartFile.encoding,
        mimetype: multipartFile.mimetype,
        buffer,
        size: buffer.length,
      };

      request.body = normalizeMultipartFields(multipartFile.fields);
      Object.defineProperty(request, 'file', {
        configurable: true,
        enumerable: true,
        value: uploadedFile,
        writable: true,
      });

      return next.handle();
    }
  }

  return mixin(MixinFastifyFileInterceptor);
}

function normalizeMultipartFields(fields?: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields ?? {})) {
    if (key === 'file') continue;
    body[key] = extractMultipartValue(field);
  }
  return body;
}

function extractMultipartValue(field: unknown): unknown {
  if (Array.isArray(field)) {
    return field.map(extractMultipartValue);
  }
  if (field && typeof field === 'object' && 'value' in field) {
    return (field as { value: unknown }).value;
  }
  return field;
}
