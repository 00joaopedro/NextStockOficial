import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ROLES_KEY } from './auth/roles.decorator';
import { RolesGuard } from './auth/roles.guard';
import { Role } from '@prisma/client';
import { PaymentMachinesController } from './payment-machines/payment-machines.controller';
import { PetClientsController } from './pet-clients/pet-clients.controller';
import { PetsController } from './pets/pets.controller';
import { ProfileController } from './profile/profile.controller';
import { BranchContextGuard } from './tenancy/branch-context.guard';
import { PreviewMutationGuard } from './system/guards/preview-mutation.guard';
import { SalesController } from './sales/sales.controller';

function guards(target: any) {
  return (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as unknown[];
}

describe('Multi-tenant security metadata', () => {
  it('payment machines e profile exigem JWT e RBAC', () => {
    expect(guards(PaymentMachinesController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard]),
    );
    expect(guards(ProfileController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard]),
    );
  });

  it('rotas Pet exigem contexto de filial validado', () => {
    expect(guards(PetClientsController)).toContain(BranchContextGuard);
    expect(guards(PetsController)).toContain(BranchContextGuard);
  });

  it('sales exige JWT, RBAC, contexto de filial e protecao de preview', () => {
    expect(guards(SalesController)).toEqual(
      expect.arrayContaining([
        JwtAuthGuard,
        RolesGuard,
        PreviewMutationGuard,
        BranchContextGuard,
      ]),
    );
    expect(
      Reflect.getMetadata(ROLES_KEY, SalesController.prototype.create),
    ).toEqual([Role.Admin, Role.Vendedor]);
    expect(
      Reflect.getMetadata(ROLES_KEY, SalesController.prototype.cancel),
    ).toEqual([Role.Admin]);
  });

  it('vendedor/comprador nao alteram perfil nem maquinas', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ProfileController.prototype.updateCompany),
    ).toEqual([Role.Admin]);
    expect(
      Reflect.getMetadata(ROLES_KEY, ProfileController.prototype.updatePlan),
    ).toEqual([Role.Admin]);
    expect(
      Reflect.getMetadata(ROLES_KEY, ProfileController.prototype.updateMode),
    ).toEqual([Role.Admin]);
    expect(
      Reflect.getMetadata(ROLES_KEY, PaymentMachinesController.prototype.create),
    ).toEqual([Role.Admin]);
    expect(
      Reflect.getMetadata(ROLES_KEY, PaymentMachinesController.prototype.update),
    ).toEqual([Role.Admin]);
    expect(
      Reflect.getMetadata(ROLES_KEY, PaymentMachinesController.prototype.remove),
    ).toEqual([Role.Admin]);
  });
});
