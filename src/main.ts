import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCompress from '@fastify/compress';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { ProductionExceptionFilter } from './security/production-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

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

  await app.register(fastifyCompress, {
    threshold: Number(process.env.COMPRESSION_THRESHOLD_BYTES || 1024),
    encodings: ['gzip', 'deflate', 'br'],
  });
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, { attachFieldsToBody: false });
  await app.register(fastifyHelmet, {
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
  });
  app.addHook('onRequest', (request, reply, done) => {
    const header = request.headers['x-request-id'];
    const requestId =
      sanitizeRequestId(Array.isArray(header) ? header[0] : header) ??
      randomUUID();
    reply.header('X-Request-Id', requestId);
    (request as typeof request & { requestId?: string }).requestId = requestId;
    done();
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
  console.log(`Health: /api/health`);
  console.log(`Readiness: /api/health/ready`);
  console.log(`Public: /`);
}
void bootstrap().catch((error: unknown) => {
  const message = sanitizeBootstrapError(error);
  console.error(`Bootstrap failed: ${message}`);
  process.exitCode = 1;
});

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

function sanitizeBootstrapError(error: unknown) {
  let message =
    error instanceof Error ? error.message : 'Unknown bootstrap failure';
  const sensitiveNames = [
    'DATABASE_URL',
    'DIRECT_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_JWT_SECRET',
    'MERCADO_PAGO_ACCESS_TOKEN',
    'MERCADO_PAGO_WEBHOOK_SECRET',
    'BILLING_EXTERNAL_REFERENCE_SECRET',
    'AUDIT_HASH_SECRET',
    'SESSION_HASH_SECRET',
    'CERT_ENCRYPTION_KEY',
  ];
  for (const name of sensitiveNames) {
    const value = process.env[name];
    if (value && value.length >= 8) {
      message = message.split(value).join('[REDACTED]');
    }
  }
  return message
    .replace(/\b(?:postgres(?:ql)?):\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);
}
