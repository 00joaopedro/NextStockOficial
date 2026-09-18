import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const dto = (password: string) => Object.assign(new RegisterDto(), {
  email: 'user@example.com', name: 'User', companyName: 'Company', password, systemType: 'padrao',
});

describe('RegisterDto password boundary', () => {
  it('rejects five characters', async () => {
    expect((await validate(dto('A'.repeat(5)))).some((e) => e.property === 'password')).toBe(true);
  });

  it.each([6, 7, 12, 128])('accepts %s alphanumeric characters', async (length) => {
    expect((await validate(dto('A'.repeat(length)))).some((e) => e.property === 'password')).toBe(false);
  });

  it('rejects 129 characters', async () => {
    expect((await validate(dto('A'.repeat(129)))).some((e) => e.property === 'password')).toBe(true);
  });
});
