import { ConflictException, HttpException } from '@nestjs/common';
import {
  Prisma,
  RegistrationIntent,
  SystemType,
  UserProvisioningState,
} from '@prisma/client';
import { AuthService } from './auth.service';
import type { AuthIdentityProvider } from './auth-provider';
import type { PrismaService } from '../prisma/prisma.service';
import type { DevWorkspaceService } from '../tenancy/dev-workspace.service';

describe('safe recovery of a failed public registration', () => {
  const input = {
    email: 'new@example.test',
    idempotencyKey: 'email-key',
    payloadHash: 'new-data',
    name: 'Correct name',
    companyName: 'Correct company',
    systemType: SystemType.padrao,
    referralPartnerId: null,
  };
  const previous = {
    id: 'intent',
    canonicalEmail: input.email,
    idempotencyKey: input.idempotencyKey,
    payloadHash: 'old-data',
    state: UserProvisioningState.FAILED_RETRYABLE,
    claimToken: null,
    tenantId: null,
    branchId: null,
    completedAt: null,
    authUserId: null,
    leaseExpiresAt: null,
    lastErrorCode: 'AUTH_LOOKUP_FAILED_BEFORE_CREATE',
    updatedAt: new Date('2026-01-01'),
  };

  function fixture(overrides: Partial<RegistrationIntent> = {}) {
    const existing = { ...previous, ...overrides };
    const registrationIntent = {
      create: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6',
        }),
      ),
      findFirst: jest.fn().mockResolvedValue(existing),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        ...existing,
        state: UserProvisioningState.CLAIMED,
        payloadHash: input.payloadHash,
      }),
    };
    const userProfile = { findFirst: jest.fn().mockResolvedValue(null) };
    const provider = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
    };
    const service = new AuthService(
      provider as unknown as AuthIdentityProvider,
      { registrationIntent, userProfile } as unknown as PrismaService,
      {} as DevWorkspaceService,
    );
    const claim = (data = input) =>
      (
        service as unknown as {
          claimRegistrationIntent(
            value: typeof input,
          ): Promise<RegistrationIntent>;
        }
      ).claimRegistrationIntent(data);
    return { claim, registrationIntent, userProfile, provider };
  }

  it('replaces data only after a safe released failure and absence of any account', async () => {
    const f = fixture();
    await expect(f.claim()).resolves.toMatchObject({
      state: 'CLAIMED',
      payloadHash: 'new-data',
    });
    expect(f.registrationIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'intent',
          payloadHash: 'old-data',
          updatedAt: previous.updatedAt,
          state: 'FAILED_RETRYABLE',
          claimToken: null,
          tenantId: null,
          branchId: null,
          completedAt: null,
        }) as unknown,
        data: expect.objectContaining({
          requestedName: 'Correct name',
          companyName: 'Correct company',
          referralPartnerId: null,
          authUserId: null,
        }) as unknown,
      }),
    );
    expect(f.provider.findByEmail).toHaveBeenCalledWith(input.email);
    expect(f.userProfile.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([
    'CLAIMED',
    'AUTH_CREATED',
    'UNKNOWN',
    'COMPENSATION_REQUIRED',
    'FAILED_FINAL',
    'COMPLETED',
  ] as const)('does not reset %s', async (state) => {
    const f = fixture({ state });
    await expect(f.claim()).rejects.toBeInstanceOf(ConflictException);
    expect(f.registrationIntent.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    'provider_timeout',
    'AUTH_CREATE_FAILED',
    'unknown_provider_error',
    null,
  ])(
    'does not assume failure %s means remote creation did not happen',
    async (lastErrorCode) => {
      const f = fixture({ lastErrorCode });
      await expect(f.claim()).rejects.toBeInstanceOf(ConflictException);
      expect(f.registrationIntent.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects cross-account reuse without touching either account', async () => {
    const f = fixture({ canonicalEmail: 'other@example.test' });
    await expect(f.claim()).rejects.toMatchObject({
      response: { code: 'REGISTRATION_KEY_CONFLICT' },
    });
    expect(f.provider.findByEmail).not.toHaveBeenCalled();
    expect(f.registrationIntent.updateMany).not.toHaveBeenCalled();
  });

  it('never resets an existing profile, provider identity or an identity under the previous ID', async () => {
    const profile = fixture();
    profile.userProfile.findFirst.mockResolvedValue({ id: 'profile' });
    await expect(profile.claim()).rejects.toBeInstanceOf(ConflictException);
    expect(profile.registrationIntent.updateMany).not.toHaveBeenCalled();
    const remote = fixture();
    remote.provider.findByEmail.mockResolvedValue({ id: 'remote' });
    await expect(remote.claim()).rejects.toBeInstanceOf(ConflictException);
    expect(remote.registrationIntent.updateMany).not.toHaveBeenCalled();
    const oldId = fixture({ authUserId: 'old-id' });
    oldId.provider.findById.mockResolvedValue({
      id: 'old-id',
      email: 'changed@example.test',
    });
    await expect(oldId.claim()).rejects.toBeInstanceOf(ConflictException);
    expect(oldId.registrationIntent.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when account verification fails', async () => {
    const f = fixture();
    f.provider.findByEmail.mockRejectedValue(
      new Error('sensitive-provider-message'),
    );
    await expect(f.claim()).rejects.toMatchObject({
      status: 503,
      response: { code: 'REGISTRATION_RECOVERY_UNAVAILABLE' },
    });
    expect(f.registrationIntent.updateMany).not.toHaveBeenCalled();
  });

  it('allows only the winner of a conditional recovery to proceed', async () => {
    const f = fixture();
    f.registrationIntent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const result = await Promise.allSettled([f.claim(), f.claim()]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.registrationIntent.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it('returns an identical completed intent for the existing password verification flow', async () => {
    const f = fixture({ state: 'COMPLETED', payloadHash: input.payloadHash });
    await expect(f.claim()).resolves.toMatchObject({ state: 'COMPLETED' });
    expect(f.provider.findByEmail).not.toHaveBeenCalled();
    expect(f.registrationIntent.updateMany).not.toHaveBeenCalled();
  });

  it('returns a safe code in Portuguese without provider details', async () => {
    const f = fixture({ state: 'COMPLETED' });
    try {
      await f.claim();
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse();
      expect(response).toMatchObject({
        code: 'REGISTRATION_ALREADY_COMPLETED',
      });
      expect(JSON.stringify(response)).not.toContain('old-data');
    }
  });
});
