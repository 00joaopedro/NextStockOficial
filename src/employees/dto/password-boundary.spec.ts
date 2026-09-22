import { validate } from 'class-validator';
import { EmployeeRole } from '@prisma/client';
import { CreateEmployeeDto } from './create-employee.dto';
import { ResetEmployeePasswordDto } from './reset-employee-password.dto';

const createDto = (password: string) => Object.assign(new CreateEmployeeDto(), {
  fullName: 'Funcionario',
  email: 'funcionario@example.com',
  password,
  employeeRole: EmployeeRole.caixa,
  jobTitle: 'Operador',
});

const resetDto = (password: string) => Object.assign(new ResetEmployeePasswordDto(), { password });

describe('employee password boundaries', () => {
  it.each([createDto, resetDto])('rejects five characters', async (factory) => {
    expect((await validate(factory('12345'))).length).toBeGreaterThan(0);
  });

  it.each([createDto, resetDto])('accepts six and 128 characters', async (factory) => {
    await expect(validate(factory('123456'))).resolves.toHaveLength(0);
    await expect(validate(factory('1'.repeat(128)))).resolves.toHaveLength(0);
  });

  it.each([createDto, resetDto])('rejects 129 characters', async (factory) => {
    expect((await validate(factory('1'.repeat(129)))).length).toBeGreaterThan(0);
  });
});
