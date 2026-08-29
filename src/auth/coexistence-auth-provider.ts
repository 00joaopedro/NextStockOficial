import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalizeEmail } from '../common/canonical-email';
import { legacyFallbackEnabled } from './auth-provider-mode';
import { AuthIdentityProvider, AuthProviderError } from './auth-provider';
import { LocalAuthProvider } from './local-auth-provider';
import { SupabaseAuthProvider } from './supabase-auth-provider';

@Injectable()
export class CoexistenceAuthProvider implements AuthIdentityProvider {
  readonly name = 'coexistence' as const;
  constructor(
    private readonly prisma: PrismaService,
    private readonly local: LocalAuthProvider,
    private readonly supabase: SupabaseAuthProvider,
  ) {}

  async login(input: { email: string; password: string }) {
    const credential = await this.prisma.localCredential.findFirst({
      where: { profile: { email: canonicalizeEmail(input.email) } },
      select: { id: true },
    });
    if (credential) return { ...(await this.local.login(input)), provider: 'local' as const };
    if (!legacyFallbackEnabled()) throw new AuthProviderError('invalid_credentials');
    return { ...(await this.supabase.login(input)), provider: 'supabase' as const };
  }

  createUser(input: Parameters<AuthIdentityProvider['createUser']>[0]) { return this.local.createUser(input); }
  refresh(token: string) { return this.supabase.refresh(token); }
  requestPasswordRecovery(email: string, redirectTo?: string) { return this.supabase.requestPasswordRecovery(email, redirectTo); }
  verifyEmail(token: string) { return this.supabase.verifyEmail(token); }
  findById(id: string) { return this.supabase.findById(id); }
  findByEmail(email: string) { return this.supabase.findByEmail(email); }
  deleteUser(id: string) { return this.supabase.deleteUser(id); }
  revokeSessions(id: string) { return this.supabase.revokeSessions(id); }
  logout(token?: string, global?: boolean) { return this.supabase.logout(token, global); }
  getAuthenticatedIdentity(token: string) { return this.supabase.getAuthenticatedIdentity(token); }
}
