import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { json } from 'express';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.enableCors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed = (process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
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
