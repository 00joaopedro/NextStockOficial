import { randomUUID } from 'node:crypto';
import {
  AuthLookup,
  AuthOperationError,
  UserAuthAdapter,
} from '../../src/users/user-auth.adapter';

export type FakeAuthMode =
  | 'success'
  | 'conflict'
  | 'timeout-before'
  | 'timeout-after'
  | 'delete-failed'
  | 'delete-uncertain';

export class FakeUserAuthAdapter implements UserAuthAdapter {
  createCalls = 0;
  deleteCalls = 0;
  lookupCalls = 0;
  mode: FakeAuthMode = 'success';
  private readonly users = new Map<string, { id: string; email: string }>();
  private gate?: Promise<void>;
  private releaseGate?: () => void;

  barrier() {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
    return () => this.releaseGate?.();
  }

  async create(input: { email: string }) {
    this.createCalls += 1;
    if (this.gate) await this.gate;
    if (this.mode === 'conflict')
      throw new AuthOperationError('AUTH_EMAIL_EXISTS', 'not-created');
    if (this.mode === 'timeout-before')
      throw new AuthOperationError('AUTH_TIMEOUT', 'not-created');
    const user = { id: randomUUID(), email: input.email };
    this.users.set(user.id, user);
    if (this.mode === 'timeout-after')
      throw new AuthOperationError('AUTH_TIMEOUT', 'unknown');
    return user;
  }

  async delete(id: string) {
    await Promise.resolve();
    this.deleteCalls += 1;
    if (this.mode === 'delete-failed' || this.mode === 'delete-uncertain')
      return 'unknown' as const;
    const existed = this.users.delete(id);
    return existed ? ('deleted' as const) : ('absent' as const);
  }

  async lookup(id: string): Promise<AuthLookup> {
    await Promise.resolve();
    this.lookupCalls += 1;
    const user = this.users.get(id);
    return user ? { status: 'found', user } : { status: 'absent' };
  }
}
