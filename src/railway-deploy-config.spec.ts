import { readFileSync } from 'fs';
import { join } from 'path';

describe('Railway deploy configuration', () => {
  const repositoryRoot = join(__dirname, '..');
  const readJson = (path: string) =>
    JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8')) as Record<
      string,
      any
    >;

  it('runs the guarded migration phase before starting the release', () => {
    const railway = readJson('railway.json');

    expect(railway.deploy.preDeployCommand).toBe('npm run railway:migrate');
    expect(railway.deploy.startCommand).toBe('npm run start:railway');
    expect(railway.build.preDeployCommand).toBeUndefined();
  });

  it('keeps migrations out of the application start command', () => {
    const packageJson = readJson('package.json');

    expect(packageJson.scripts['railway:migrate']).toBe(
      'ts-node scripts/migrations/validate-target.ts && prisma migrate deploy',
    );
    expect(packageJson.scripts['start:railway']).toBe('npm run start:prod');
    expect(packageJson.scripts['start:prod']).not.toMatch(/migrat|db push/i);
  });
});
