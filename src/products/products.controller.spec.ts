import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ProductsController } from './products.controller';

describe('ProductsController guards', () => {
  function guardsFor(methodName: keyof ProductsController) {
    return Reflect.getMetadata(
      GUARDS_METADATA,
      ProductsController.prototype[methodName],
    ) as unknown[];
  }

  it('mantem GET com JWT opcional para preview/listagem', () => {
    expect(guardsFor('findAll')).toContain(OptionalJwtAuthGuard);
    expect(guardsFor('findOne')).toContain(OptionalJwtAuthGuard);
  });

  it('exige JWT nas rotas de escrita de produtos', () => {
    expect(guardsFor('create')).toContain(JwtAuthGuard);
    expect(guardsFor('update')).toContain(JwtAuthGuard);
    expect(guardsFor('remove')).toContain(JwtAuthGuard);
    expect(guardsFor('addImages')).toContain(JwtAuthGuard);
    expect(guardsFor('removeImage')).toContain(JwtAuthGuard);
  });
});
