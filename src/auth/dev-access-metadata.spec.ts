import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppController } from '../app.controller';
import { DevController } from '../dev/dev.controller';
import { SystemController } from '../system/system.controller';
import { DevSuperAdminGuard } from './dev-super-admin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

function guardNames(target: any): string[] {
  return ((Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as any[]).map(
    (guard) => guard.name,
  );
}

describe('Dev access guard metadata', () => {
  it('/api/dev/* exige JwtAuthGuard e DevSuperAdminGuard', () => {
    expect(guardNames(DevController)).toEqual(
      expect.arrayContaining([JwtAuthGuard.name, DevSuperAdminGuard.name]),
    );
  });

  it('/api/system/pages exige JwtAuthGuard e DevSuperAdminGuard', () => {
    expect(guardNames(SystemController.prototype.getPages)).toEqual(
      expect.arrayContaining([JwtAuthGuard.name, DevSuperAdminGuard.name]),
    );
  });

  it('GET /dev.html exige JwtAuthGuard e DevSuperAdminGuard antes de entregar HTML', () => {
    expect(guardNames(AppController.prototype.devHtml)).toEqual(
      expect.arrayContaining([JwtAuthGuard.name, DevSuperAdminGuard.name]),
    );
  });
});
