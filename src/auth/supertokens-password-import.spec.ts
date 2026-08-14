import { strict as assert } from 'node:assert';
import { validatePasswordHash, validateRecord } from '../../scripts/auth/supertokens-password-import';

describe('SuperTokens password import safety', () => {
  it('accepts official bcrypt and argon2 formats without exposing the hash', () => {
    assert.equal(validatePasswordHash('$2b$10$GzEm3vKoAqnJCTWesRARCe/ovjt/07qjvcH9jbLUg44Fn77gMZkmm'), 'bcrypt');
    assert.equal(validatePasswordHash('$argon2id$v=19$m=16,t=2,p=1$VG1Oa1lMbzZLbzk5azQ2Qg$kjcNNtZ/b0t/8HgXUiQ76A'), 'argon2');
  });
  it('rejects unknown algorithms and non-Supabase records', () => {
    assert.throws(() => validatePasswordHash('plaintext'), /UNSUPPORTED/);
    assert.throws(() => validateRecord({ provider: 'other', subject: 's', email: 'a@b.test', passwordHash: 'plaintext' }), /INVALID/);
  });
});
