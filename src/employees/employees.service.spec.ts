import { ConflictException } from '@nestjs/common';
import { EmployeeRole, EmployeeStatus, Role, SystemMode, SystemType } from '@prisma/client';
import { EmployeesService } from './employees.service';

const authUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'caixa@example.com',
};

const context = {
  userId: 'admin-id',
  tenantId: 'tenant-id',
  branchId: 'branch-id',
  role: Role.Admin,
  systemType: SystemType.padrao,
  mode: SystemMode.padrao,
  isDevSuperAdmin: false,
  contextKind: 'normal',
};

function makeService(overrides: Record<string, any> = {}) {
  const tx = {
    userProfile: {
      create: jest.fn().mockResolvedValue({ id: authUser.id, role: Role.Vendedor }),
    },
    employee: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'employee-id',
          ...data,
          createdAt: new Date('2026-06-10T10:00:00.000Z'),
          updatedAt: new Date('2026-06-10T10:00:00.000Z'),
          deletedAt: null,
          profile: { id: authUser.id, role: Role.Vendedor },
          createdBy: null,
          updatedBy: null,
        }),
      ),
    },
  };

  const prisma = {
    userProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
    },
    employee: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((arg) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }

      return arg(tx);
    }),
    ...overrides.prisma,
  };

  const supabase = {
    admin: {
      auth: {
        admin: {
          createUser: jest.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
          deleteUser: jest.fn().mockResolvedValue({ error: null }),
          updateUserById: jest.fn().mockResolvedValue({ error: null }),
        },
      },
    },
    ...overrides.supabase,
  };

  const tenantContext = {
    resolve: jest.fn().mockResolvedValue(context),
    ...overrides.tenantContext,
  };

  return {
    service: new EmployeesService(prisma as any, supabase as any, tenantContext as any),
    prisma,
    supabase,
    tenantContext,
    tx,
  };
}

describe('EmployeesService', () => {
  it('cria funcionario logavel vinculado ao tenant e branch do contexto sem retornar senha', async () => {
    const { service, supabase, tx, tenantContext } = makeService();

    const result = await service.create(
      { id: 'admin-id', email: 'admin@example.com' } as any,
      {
        fullName: 'Operador Caixa',
        email: 'CAIXA@example.com',
        password: 'SenhaForte123',
        employeeRole: EmployeeRole.caixa,
        jobTitle: 'Operador de Caixa',
      },
      'branch-id',
    );

    expect(tenantContext.resolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        selectedBranchId: 'branch-id',
        requireBranch: true,
        writable: true,
        allowedRoles: [Role.Admin],
      }),
    );
    expect(supabase.admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'caixa@example.com',
      password: 'SenhaForte123',
      email_confirm: true,
      user_metadata: { name: 'Operador Caixa', employee: true },
    });
    expect(tx.userProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supabaseUserId: authUser.id,
          tenantId: context.tenantId,
          primaryTenantId: context.tenantId,
          systemType: context.systemType,
          allowedSystemTypes: [context.systemType],
          isSuperAdmin: false,
          role: Role.Vendedor,
          memberships: {
            create: {
              tenantId: context.tenantId,
              branchId: context.branchId,
              role: Role.Vendedor,
            },
          },
        }),
      }),
    );
    expect(tx.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: context.tenantId,
          branchId: context.branchId,
          employeeRole: EmployeeRole.caixa,
          status: EmployeeStatus.active,
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('SenhaForte123');
  });

  it('faz rollback do usuario Supabase quando a criacao Prisma falha', async () => {
    const { service, supabase, tx } = makeService();
    tx.userProfile.create.mockRejectedValueOnce(new Error('db failed'));

    await expect(
      service.create(
        { id: 'admin-id', email: 'admin@example.com' } as any,
        {
          fullName: 'Operador Caixa',
          email: 'caixa@example.com',
          password: 'SenhaForte123',
          employeeRole: EmployeeRole.caixa,
          jobTitle: 'Operador de Caixa',
        },
      ),
    ).rejects.toThrow('Employee creation failed');

    expect(supabase.admin.auth.admin.deleteUser).toHaveBeenCalledWith(authUser.id);
  });

  it('falha com email duplicado antes de criar usuario no Supabase', async () => {
    const { service, prisma, supabase } = makeService({
      prisma: {
        userProfile: {
          findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
          findUnique: jest.fn(),
        },
      },
    });

    await expect(
      service.create(
        { id: 'admin-id', email: 'admin@example.com' } as any,
        {
          fullName: 'Operador Caixa',
          email: 'caixa@example.com',
          password: 'SenhaForte123',
          employeeRole: EmployeeRole.caixa,
          jobTitle: 'Operador de Caixa',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.userProfile.findFirst).toHaveBeenCalled();
    expect(supabase.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });
});
