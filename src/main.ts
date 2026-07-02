import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { json } from 'express';
import compression = require('compression');
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { ProductionExceptionFilter } from './security/production-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new ProductionExceptionFilter());

  app.use(
    compression({
      threshold: Number(process.env.COMPRESSION_THRESHOLD_BYTES || 1024),
      filter(req, res) {
        const contentType = String(res.getHeader('Content-Type') || '');
        if (
          /(?:image\/|application\/(?:pdf|zip)|font\/|application\/octet-stream)/i.test(
            contentType,
          )
        ) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );
  app.use(cookieParser());
  app.use(json());
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        reportOnly: process.env.CSP_ENFORCE !== 'true',
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          connectSrc: ["'self'", ...allowedOrigins()],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests:
            process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 15_552_000, includeSubDomains: true }
          : false,
    }),
  );
  app.use((req, res, next) => {
    const requestId = sanitizeRequestId(req.header('x-request-id')) ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);
    (req as typeof req & { requestId?: string }).requestId = requestId;
    next();
  });

  app.enableCors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed = allowedOrigins();
      const localhost =
        process.env.NODE_ENV !== 'production' &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      return callback(null, allowed.includes(origin) || localhost);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'dev.html', method: RequestMethod.GET },
      { path: 'parceiros.html', method: RequestMethod.GET },
    ],
  });

  const port = Number(process.env.PORT || 3000);
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  console.log(`Listening on ${port}`);
  console.log(`Health: /api`);
  console.log(`Public: /`);
}
bootstrap();

function allowedOrigins() {
  return (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function sanitizeRequestId(value?: string) {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9._-]{8,128}$/.test(normalized)
    ? normalized
    : undefined;
}
