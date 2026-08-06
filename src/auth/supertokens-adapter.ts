import { Injectable } from '@nestjs/common';
import { AuthProviderError } from './auth-provider';

export type SuperTokensIdentity = { providerUserId: string; canonicalEmail: string };
export type SuperTokensFault = 'unavailable' | 'timeout' | 'conflict';
export interface SuperTokensAdapter {
  authenticate(email: string, password: string): Promise<SuperTokensIdentity>;
  createAfterLegacyAuthentication(email: string, password: string): Promise<SuperTokensIdentity>;
  requestPasswordRecovery(email: string): Promise<void>;
}

/** Offline seam only. Phase 5 does not initialize an SDK or connect to Core. */
@Injectable()
export class FakeSuperTokensAdapter implements SuperTokensAdapter {
  private fault?: SuperTokensFault;
  readonly calls: string[] = [];
  setFault(fault?: SuperTokensFault) { this.fault = fault; }
  async authenticate(email: string, _password: string) { this.calls.push('authenticate'); this.fail(); return { providerUserId: `fake:${email}`, canonicalEmail: email }; }
  async createAfterLegacyAuthentication(email: string, _password: string) { this.calls.push('createAfterLegacyAuthentication'); this.fail(); return { providerUserId: `fake:${email}`, canonicalEmail: email }; }
  async requestPasswordRecovery(_email: string) { this.calls.push('requestPasswordRecovery'); this.fail(); }
  private fail() { if (this.fault === 'unavailable') throw new AuthProviderError('provider_unavailable'); if (this.fault === 'timeout') throw new AuthProviderError('provider_timeout'); if (this.fault === 'conflict') throw new AuthProviderError('conflict'); }
}
