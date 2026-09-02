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
import { trustedProxyHops } from './config/trusted-proxy';
import { processRole } from './config/process-role';

async function bootstrap() {
  const role = processRole();
  if (role === 'audit-worker') {
    await import('./audit-worker');
    return;
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: trustedProxyHops() }),
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
      reportOnly: isCspReportOnly(),
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:', ...assetOrigins()],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        connectSrc: ["'self'", ...allowedOrigins(), ...serviceOrigins()],
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
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      const header = request.headers['x-request-id'];
      const requestId =
        sanitizeRequestId(Array.isArray(header) ? header[0] : header) ??
        randomUUID();
      reply.header('X-Request-Id', requestId);
      (request as typeof request & { requestId?: string }).requestId =
        requestId;
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
      { path: 'loja/:slug', method: RequestMethod.GET },
    ],
  });

  const port = Number(process.env.PORT || 3000);
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  console.log(`Listening on ${port}`);
  console.log(`Health: /api/health`);
  console.log(`Readiness: /api/health/ready`);
  console.log(`Public: /`);
  console.log(
    JSON.stringify({
      event: 'auth_rate_limit_configuration',
      enabled: process.env.AUTH_RATE_LIMIT_ENABLED === 'true',
      store: process.env.AUTH_RATE_LIMIT_STORE || 'postgres',
      trustedProxyHops: trustedProxyHops(),
      processRole: role,
    }),
  );
}
void bootstrap().catch((error: unknown) => {
  const message = sanitizeBootstrapError(error);
  console.error(`Bootstrap failed: ${message}`);
  process.exitCode = 1;
});

function isCspReportOnly() {
  if (process.env.CSP_REPORT_ONLY) {
    return process.env.CSP_REPORT_ONLY === 'true';
  }
  return process.env.CSP_ENFORCE === 'false';
}

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

function serviceOrigins() {
  return [
    originFromUrl(process.env.SUPABASE_URL),
    'https://viacep.com.br',
  ].filter((origin): origin is string => Boolean(origin));
}

function assetOrigins() {
  return [originFromUrl(process.env.SUPABASE_URL)].filter(
    (origin): origin is string => Boolean(origin),
  );
}

function originFromUrl(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}
