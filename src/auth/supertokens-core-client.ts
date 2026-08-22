import { Injectable } from '@nestjs/common';

export type SuperTokensCoreConfig = {
  connectionUri: string;
  apiKey: string;
  timeoutMs?: number;
};

/** Minimal HTTP boundary for the documented Core migration APIs. */
@Injectable()
export class SuperTokensCoreClient {
  constructor(private readonly config: SuperTokensCoreConfig) {
    if (!config.connectionUri || !config.apiKey) throw new Error('SUPERTOKENS_CORE_CONFIGURATION_INVALID');
  }

  async importPasswordHash(input: { email: string; passwordHash: string }) {
    const response = await this.request('/recipe/user/passwordhash/import', input);
    return response as { status: string; userId?: string };
  }

  async request(path: string, body: unknown) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);
    try {
      const response = await fetch(new URL(path, this.config.connectionUri), {
        method: 'POST',
        headers: { 'api-key': this.config.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'SUPERTOKENS_CORE_AUTH_FAILED' : 'SUPERTOKENS_CORE_UNAVAILABLE');
      return await response.json() as unknown;
    } finally {
      clearTimeout(timer);
    }
  }
}
