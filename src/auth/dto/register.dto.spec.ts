import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const dto = (password: string) => Object.assign(new RegisterDto(), {
  email: 'user@example.com', name: 'User', companyName: 'Company', password, systemType: 'padrao',
});

describe('RegisterDto password boundary', () => {
  it('rejects 11 characters', async () => {
    expect((await validate(dto('A'.repeat(11)))).some((e) => e.property === 'password')).toBe(true);
  });

  it('accepts 12 alphanumeric characters', async () => {
    expect((await validate(dto('A'.repeat(12)))).some((e) => e.property === 'password')).toBe(false);
  });
});
