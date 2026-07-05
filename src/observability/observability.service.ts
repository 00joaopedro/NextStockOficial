import { Injectable } from '@nestjs/common';

const REDACTED_KEYS =
  /authorization|cookie|password|senha|token|secret|service.?role|certificate|pfx|signed.?url|mercado.?pago/i;

@Injectable()
export class ObservabilityService {
  log(event: Record<string, unknown>) {
    const safeEvent = this.redact(event) as Record<string, unknown>;
    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        environment:
          process.env.SENTRY_ENVIRONMENT ||
          process.env.APP_ENV ||
          process.env.NODE_ENV ||
          'development',
        release:
          process.env.SENTRY_RELEASE || process.env.RAILWAY_DEPLOYMENT_ID,
        ...safeEvent,
      })}\n`,
    );
  }

  private redact(value: unknown, depth = 0): unknown {
    if (depth > 4) return '[TRUNCATED]';
    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => this.redact(item, depth + 1));
    }
    if (!value || typeof value !== 'object') {
      return typeof value === 'string' ? value.slice(0, 500) : value;
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !REDACTED_KEYS.test(key))
        .map(([key, item]) => [key, this.redact(item, depth + 1)]),
    );
  }
}
