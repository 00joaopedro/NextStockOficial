import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import {
  AuditContextKind,
  AuditOutcome,
  AuditSeverity,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from '../audit/audit-outbox.service';
import { AuthService } from './auth.service';
import { LocalJwtService } from './local-jwt.service';
import { assertLocalJwtConfigured } from './local-jwt-config';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const TTL = 5 * 60_000;

type GoogleOAuthSessionUser = { id: string; tenantId?: string | null };
export type GoogleOAuthCallbackResult =
  | {
      kind: 'session';
      redirectTo: string;
      accessToken: string;
      user: GoogleOAuthSessionUser;
    }
  | { kind: 'linked'; redirectTo: string; profileId: string };

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function challenge(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}
function config() {
  const enabled = process.env.GOOGLE_OAUTH_ENABLED === 'true';
  if (!enabled)
    throw new ServiceUnavailableException('Google login is disabled.');
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const callback = process.env.GOOGLE_OAUTH_CALLBACK_URL?.trim();
  if (!id || !secret || !callback)
    throw new ServiceUnavailableException('Google login is not configured.');
  try {
    assertLocalJwtConfigured();
  } catch {
    throw new ServiceUnavailableException(
      'Google login requires local session signing configuration.',
    );
  }
  return { id, secret, callback };
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly jwt: LocalJwtService,
    private readonly auditOutbox: AuditOutboxService,
  ) {}

  async start(
    purpose: 'login' | 'link',
    profileId?: string,
    sessionId?: string,
  ) {
    const c = config();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    await this.prisma.oAuthIntent.create({
      data: {
        provider: 'google',
        stateHash: hash(state),
        nonceHash: hash(nonce),
        purpose,
        userProfileId: profileId,
        sessionId,
        redirectTo: '/produtos.html',
        expiresAt: new Date(Date.now() + TTL),
      },
    });
    const url = new URL(GOOGLE_AUTH);
    url.search = new URLSearchParams({
      client_id: c.id,
      redirect_uri: c.callback,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge(state),
      code_challenge_method: 'S256',
      access_type: 'online',
      prompt: 'select_account',
    }).toString();
    return url.toString();
  }

  async callback(
    code: string,
    state: string,
  ): Promise<GoogleOAuthCallbackResult> {
    const c = config();
    if (!code || !state)
      throw new UnauthorizedException('Invalid Google OAuth callback.');
    const intent = await this.prisma.oAuthIntent.findFirst({
      where: {
        provider: 'google',
        stateHash: hash(state),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!intent)
      throw new UnauthorizedException(
        'Invalid or expired Google OAuth request.',
      );
    const consumed = await this.prisma.oAuthIntent.updateMany({
      where: { id: intent.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new UnauthorizedException('Google OAuth request already used.');
    const tokenResponse = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.id,
        client_secret: c.secret,
        redirect_uri: c.callback,
        grant_type: 'authorization_code',
        code_verifier: state,
      }),
    });
    if (!tokenResponse.ok)
      throw new UnauthorizedException('Google authentication failed.');
    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token)
      throw new UnauthorizedException('Google authentication failed.');
    const infoResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`,
    );
    if (!infoResponse.ok)
      throw new UnauthorizedException('Google authentication failed.');
    const claims = (await infoResponse.json()) as {
      sub?: string;
      email?: string;
      email_verified?: string;
      aud?: string;
      iss?: string;
      nonce?: string;
    };
    if (
      claims.aud !== c.id ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(
        claims.iss || '',
      ) ||
      !claims.nonce ||
      !timingSafeEqual(
        Buffer.from(hash(claims.nonce)),
        Buffer.from(intent.nonceHash),
      ) ||
      claims.email_verified !== 'true' ||
      !claims.sub ||
      !claims.email
    )
      throw new UnauthorizedException('Google identity could not be verified.');
    if (intent.purpose === 'link') {
      if (!intent.userProfileId)
        throw new ConflictException('Google identity cannot be linked.');
      try {
        await this.prisma.$transaction(async (tx) => {
          const activeSession =
            intent.sessionId &&
            (await tx.userSession.findFirst({
              where: {
                id: intent.sessionId,
                profileId: intent.userProfileId!,
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
              select: { id: true },
            }));
          if (!activeSession)
            throw new UnauthorizedException('Linking session expired.');
          const profile = await tx.userProfile.findUnique({
            where: { id: intent.userProfileId! },
            select: { tenantId: true },
          });
          if (!profile?.tenantId)
            throw new ConflictException('Google identity cannot be linked.');
          const identity = await tx.authIdentity.findUnique({
            where: {
              provider_providerSubject: {
                provider: 'GOOGLE',
                providerSubject: claims.sub!,
              },
            },
            select: {
              id: true,
              userProfileId: true,
              status: true,
              disabledAt: true,
            },
          });
          if (
            identity &&
            (identity.status !== 'active' || identity.disabledAt !== null)
          )
            throw new UnauthorizedException('Google identity is unavailable.');
          if (identity) {
            if (identity.userProfileId !== intent.userProfileId)
              throw new ConflictException('Google identity cannot be linked.');
            return;
          }
          const created = await tx.authIdentity.create({
            data: {
              userProfileId: intent.userProfileId!,
              provider: 'GOOGLE',
              providerSubject: claims.sub!,
              canonicalEmail: claims.email!.toLowerCase(),
              emailVerifiedAt: new Date(),
            },
            select: { id: true },
          });
          await this.auditOutbox.enqueue(tx, {
            tenantId: profile.tenantId,
            operationId: `google_identity_link:${created.id}`,
            eventType: 'auth.google_identity.linked',
            action: 'google_identity_link',
            outcome: AuditOutcome.SUCCESS,
            severity: AuditSeverity.MEDIUM,
            contextKind: AuditContextKind.NORMAL,
            actorProfileId: intent.userProfileId!,
            metadata: { provider: 'google' },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const concurrent = await this.prisma.authIdentity.findUnique({
            where: {
              provider_providerSubject: {
                provider: 'GOOGLE',
                providerSubject: claims.sub!,
              },
            },
            select: { userProfileId: true, status: true, disabledAt: true },
          });
          if (
            concurrent?.userProfileId === intent.userProfileId &&
            concurrent.status === 'active' &&
            !concurrent.disabledAt
          )
            return {
              kind: 'linked',
              redirectTo: '/perfil.html',
              profileId: intent.userProfileId,
            };
        }
        throw error;
      }
      return {
        kind: 'linked',
        redirectTo: '/perfil.html',
        profileId: intent.userProfileId,
      };
    }
    if (!identity)
      throw new ConflictException(
        'Google account requires an invitation or explicit linking.',
      );
    const session = await this.auth.issueSessionForProfile(
      identity.userProfileId,
    );
    return {
      kind: 'session',
      accessToken: session.accessToken,
      user: session.user,
      redirectTo: intent.redirectTo,
    };
  }
}
