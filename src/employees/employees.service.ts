import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeRole, EmployeeStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { ResetEmployeePasswordDto } from './dto/reset-employee-password.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';

const EMPLOYEE_ROLE_TO_RBAC: Record<EmployeeRole, Role> = {
  [EmployeeRole.admin]: Role.Admin,
  [EmployeeRole.gerente]: Role.Vendedor,
  [EmployeeRole.funcionario]: Role.Comprador,
  [EmployeeRole.estoque]: Role.Comprador,
  [EmployeeRole.caixa]: Role.Vendedor,
};

function isConflictError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('already registered') ||
    normalized.includes('already exists') ||
    normalized.includes('duplicate') ||
    normalized.includes('unique')
  );
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(
    user: Express.AuthenticatedUser | undefined,
    query: EmployeeQueryDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, false);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const where = this.buildWhere(context.tenantId, context.branchId!, query);

    const [total, employees] = await this.prisma.$transaction([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { fullName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          profile: { select: { id: true, role: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          updatedBy: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return {
      items: employees.map((employee) => this.formatEmployee(employee)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, false);
    const employee = await this.findScopedEmployeeOrThrow(id, context.tenantId, context.branchId!);

    return { employee: this.formatEmployee(employee) };
  }

  async create(
    user: Express.AuthenticatedUser | undefined,
    dto: CreateEmployeeDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    const fullName = this.cleanRequired(dto.fullName, 'fullName');
    const email = this.normalizeEmail(dto.email);
    const password = this.normalizePassword(dto.password);
    const jobTitle = this.cleanRequired(dto.jobTitle, 'jobTitle');
    const role = this.mapEmployeeRole(dto.employeeRole);
    const accessNameNormalized = this.buildAccessName(fullName, email);

    const existing = await this.prisma.userProfile.findFirst({
      where: {
        OR: [{ email }, { accessNameNormalized }],
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('email or name is already registered');
    }

    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: fullName, employee: true },
    });

    if (error) {
      if (isConflictError(error.message)) {
        throw new ConflictException(error.message);
      }

      throw new BadRequestException(error.message);
    }

    const authUser = data.user;

    if (!authUser?.id) {
      throw new InternalServerErrorException('Supabase did not return the created employee user.');
    }

    try {
      const employee = await this.prisma.$transaction(async (tx) => {
        const profile = await tx.userProfile.create({
          data: {
            id: authUser.id,
            supabaseUserId: authUser.id,
            email: authUser.email?.toLowerCase() ?? email,
            name: fullName,
            fullName,
            accessNameNormalized,
            role,
            tenantId: context.tenantId,
            primaryTenantId: context.tenantId,
            systemType: context.systemType,
            allowedSystemTypes: [context.systemType],
            isSuperAdmin: false,
            memberships: {
              create: {
                tenantId: context.tenantId,
                branchId: context.branchId,
                role,
              },
            },
          },
          select: { id: true, role: true },
        });

        return tx.employee.create({
          data: {
            profileId: profile.id,
            tenantId: context.tenantId,
            branchId: context.branchId!,
            fullName,
            email,
            jobTitle,
            employeeRole: dto.employeeRole,
            birthDate: this.parseOptionalDate(dto.birthDate),
            admissionDate: this.parseOptionalDate(dto.admissionDate),
            dismissalDate: this.parseOptionalDate(dto.dismissalDate),
            status: dto.dismissalDate ? EmployeeStatus.dismissed : EmployeeStatus.active,
            createdById: context.userId,
            updatedById: context.userId,
          },
          include: {
            profile: { select: { id: true, role: true } },
            createdBy: { select: { id: true, name: true, email: true } },
            updatedBy: { select: { id: true, name: true, email: true } },
          },
        });
      });

      return { employee: this.formatEmployee(employee) };
    } catch (error) {
      await this.supabase.admin.auth.admin.deleteUser(authUser.id).catch(() => undefined);

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('employee profile already exists');
      }

      throw new InternalServerErrorException(
        'Employee creation failed while creating database records. The authentication user was rolled back.',
      );
    }
  }

  async update(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdateEmployeeDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    const current = await this.findScopedEmployeeOrThrow(id, context.tenantId, context.branchId!);

    const nextFullName =
      dto.fullName !== undefined ? this.cleanRequired(dto.fullName, 'fullName') : undefined;
    const nextEmployeeRole = dto.employeeRole;
    const nextRbacRole = nextEmployeeRole ? this.mapEmployeeRole(nextEmployeeRole) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (nextFullName || nextRbacRole) {
        await tx.userProfile.update({
          where: { id: current.profileId },
          data: {
            ...(nextFullName ? { name: nextFullName, fullName: nextFullName } : {}),
            ...(nextRbacRole ? { role: nextRbacRole } : {}),
          },
        });

        if (nextRbacRole) {
          await tx.tenantMember.updateMany({
            where: {
              userProfileId: current.profileId,
              tenantId: context.tenantId,
              branchId: context.branchId,
            },
            data: { role: nextRbacRole },
          });
        }
      }

      return tx.employee.update({
        where: { id: current.id },
        data: {
          ...(nextFullName ? { fullName: nextFullName } : {}),
          ...(dto.jobTitle !== undefined ? { jobTitle: this.cleanRequired(dto.jobTitle, 'jobTitle') } : {}),
          ...(nextEmployeeRole ? { employeeRole: nextEmployeeRole } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.birthDate !== undefined ? { birthDate: this.parseNullableDate(dto.birthDate) } : {}),
          ...(dto.admissionDate !== undefined ? { admissionDate: this.parseNullableDate(dto.admissionDate) } : {}),
          ...(dto.dismissalDate !== undefined ? { dismissalDate: this.parseNullableDate(dto.dismissalDate) } : {}),
          updatedById: context.userId,
        },
        include: {
          profile: { select: { id: true, role: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          updatedBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    return { employee: this.formatEmployee(updated) };
  }

  async updateStatus(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdateEmployeeStatusDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    const current = await this.findScopedEmployeeOrThrow(id, context.tenantId, context.branchId!);

    if (current.profileId === context.userId && dto.status !== EmployeeStatus.active) {
      throw new ForbiddenException('Voce nao pode desativar o proprio usuario.');
    }

    const dismissalDate =
      dto.status === EmployeeStatus.dismissed
        ? this.parseOptionalDate(dto.dismissalDate) ?? new Date()
        : dto.dismissalDate
          ? this.parseOptionalDate(dto.dismissalDate)
          : null;

    const updated = await this.prisma.employee.update({
      where: { id: current.id },
      data: {
        status: dto.status,
        dismissalDate,
        updatedById: context.userId,
      },
      include: {
        profile: { select: { id: true, role: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return { employee: this.formatEmployee(updated) };
  }

  async remove(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    const current = await this.findScopedEmployeeOrThrow(id, context.tenantId, context.branchId!);

    if (current.profileId === context.userId) {
      throw new ForbiddenException('Voce nao pode remover o proprio usuario.');
    }

    const updated = await this.prisma.employee.update({
      where: { id: current.id },
      data: {
        status: EmployeeStatus.dismissed,
        dismissalDate: current.dismissalDate ?? new Date(),
        deletedAt: new Date(),
        updatedById: context.userId,
      },
      include: {
        profile: { select: { id: true, role: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return { employee: this.formatEmployee(updated) };
  }

  async resetPassword(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: ResetEmployeePasswordDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    const employee = await this.findScopedEmployeeOrThrow(id, context.tenantId, context.branchId!);
    const password = this.normalizePassword(dto.password);
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: employee.profileId },
      select: { supabaseUserId: true },
    });

    if (!profile?.supabaseUserId) {
      throw new BadRequestException('Funcionario nao possui usuario de autenticacao vinculado.');
    }

    const { error } = await this.supabase.admin.auth.admin.updateUserById(
      profile.supabaseUserId,
      { password },
    );

    if (error) {
      throw new BadRequestException(error.message);
    }

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { updatedById: context.userId },
    });

    return { ok: true };
  }

  private async resolveContext(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId: string | undefined,
    devContextMode: string | undefined,
    writable: boolean,
  ) {
    return this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable,
      allowedRoles: [Role.Admin],
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
  }

  private buildWhere(
    tenantId: string,
    branchId: string,
    query: EmployeeQueryDto,
  ): Prisma.EmployeeWhereInput {
    const search = query.search?.trim();

    return {
      tenantId,
      branchId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { employeeRole: query.role } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { jobTitle: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async findScopedEmployeeOrThrow(id: string, tenantId: string, branchId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId, branchId, deletedAt: null },
      include: {
        profile: { select: { id: true, role: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException('Funcionario nao encontrado.');
    }

    return employee;
  }

  private formatEmployee(employee: any) {
    return {
      id: employee.id,
      profileId: employee.profileId,
      tenantId: employee.tenantId,
      branchId: employee.branchId,
      fullName: employee.fullName,
      email: employee.email,
      jobTitle: employee.jobTitle,
      employeeRole: employee.employeeRole,
      role: employee.profile?.role ?? this.mapEmployeeRole(employee.employeeRole),
      status: employee.status,
      birthDate: employee.birthDate,
      admissionDate: employee.admissionDate,
      dismissalDate: employee.dismissalDate,
      deletedAt: employee.deletedAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      createdBy: employee.createdBy
        ? { id: employee.createdBy.id, name: employee.createdBy.name, email: employee.createdBy.email }
        : null,
      updatedBy: employee.updatedBy
        ? { id: employee.updatedBy.id, name: employee.updatedBy.name, email: employee.updatedBy.email }
        : null,
    };
  }

  private mapEmployeeRole(role: EmployeeRole): Role {
    if (!role || !(role in EMPLOYEE_ROLE_TO_RBAC)) {
      throw new BadRequestException('employeeRole invalido.');
    }

    return EMPLOYEE_ROLE_TO_RBAC[role];
  }

  private normalizeEmail(email?: string) {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('email is required');
    }
    return normalized;
  }

  private normalizePassword(password?: string) {
    if (!password) {
      throw new BadRequestException('password is required');
    }
    if (password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }
    return password;
  }

  private cleanRequired(value: string | undefined, field: string) {
    const cleaned = value?.trim();
    if (!cleaned) {
      throw new BadRequestException(`${field} is required`);
    }
    return cleaned;
  }

  private buildAccessName(fullName: string, email: string) {
    const nameSlug = fullName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/(^\.|\.$)/g, '');

    return `${nameSlug || email.split('@')[0]}.${email}`.slice(0, 255);
  }

  private parseOptionalDate(value?: string) {
    if (!value) {
      return null;
    }
    return this.parseDate(value);
  }

  private parseNullableDate(value?: string | null) {
    if (value === null || value === '') {
      return null;
    }
    if (!value) {
      return undefined;
    }
    return this.parseDate(value);
  }

  private parseDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }
    return date;
  }
}
