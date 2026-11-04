import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

describe('commercial checkout preparation', () => {
  it('validates read-only inspection, preservation and mode isolation', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          '--test',
          join(
            __dirname,
            '../scripts/billing/prepare-commercial-checkout.test.js',
          ),
        ],
        { stdio: 'pipe' },
      ),
    ).not.toThrow();
  });
});
