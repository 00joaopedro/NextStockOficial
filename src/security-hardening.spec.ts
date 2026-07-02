import { readFileSync } from 'fs';
import { join } from 'path';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTenantUserDto } from './users/dto/create-tenant-user.dto';
import { UpdateCurrentTenantDto } from './tenants/dto/update-current-tenant.dto';

const workspace = join(__dirname, '..');

describe('Security hardening regressions', () => {
  it('rejeita email invalido e campos administrativos em DTO de usuario', async () => {
    const value = plainToInstance(CreateTenantUserDto, {
      email: 'not-an-email',
      name: 'A',
      password: 'short',
      role: 'Dev',
      tenantId: 'attacker',
    });
    const errors = await validate(value, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['email', 'name', 'password', 'role', 'tenantId']),
    );
  });

  it('rejeita slug inseguro de tenant', async () => {
    const value = plainToInstance(UpdateCurrentTenantDto, {
      slug: '../tenant',
    });
    expect(await validate(value)).not.toHaveLength(0);
  });

  it('frontend nao le JWT do Web Storage', () => {
    const source = readFileSync(
      join(workspace, 'public', 'Js', 'dashboard.ts'),
      'utf8',
    );
    expect(source).not.toContain('nextstockAccessToken');
    expect(source).not.toContain('Bearer ${token}');
  });

  it('catalogo usa criacao segura de imagem e bloqueia esquemas perigosos', () => {
    const source = readFileSync(
      join(workspace, 'public', 'produtos.html'),
      'utf8',
    );
    expect(source).toContain('function safeImageUrl');
    expect(source).toContain('createSafeImage(product.images[0], product.name)');
    expect(source).toContain('title.textContent');
    expect(source).toContain('Legacy template intentionally disabled');
  });
});
