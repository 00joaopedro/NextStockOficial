import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CertificateStorageService {
  private readonly logger = new Logger(CertificateStorageService.name);
  private readonly bucket =
    process.env.SUPABASE_STORAGE_BUCKET_FISCAL_CERTIFICATES ||
    'fiscal-certificates';

  constructor(private readonly supabase: SupabaseService) {}

  createPath(tenantId: string, branchId: string) {
    return `${tenantId}/${branchId}/${randomUUID()}.pfx`;
  }

  async upload(path: string, buffer: Buffer) {
    const { error } = await this.supabase.admin.storage
      .from(this.bucket)
      .upload(path, buffer, {
        contentType: 'application/x-pkcs12',
        upsert: false,
      });
    if (error) {
      if (/bucket.*not found|not found.*bucket/i.test(error.message || '')) {
        throw new ServiceUnavailableException(
          'O armazenamento privado de certificados nao esta configurado.',
        );
      }
      throw new InternalServerErrorException(
        'Nao foi possivel armazenar o certificado com seguranca.',
      );
    }
  }

  async download(path: string) {
    const { data, error } = await this.supabase.admin.storage
      .from(this.bucket)
      .download(path);
    if (error || !data) {
      throw new ServiceUnavailableException(
        'Nao foi possivel carregar o certificado armazenado.',
      );
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(path: string) {
    const { error } = await this.supabase.admin.storage
      .from(this.bucket)
      .remove([path]);
    if (error) {
      throw new InternalServerErrorException(
        'Nao foi possivel remover o certificado armazenado.',
      );
    }
  }

  async cleanup(path: string, reason: 'rollback' | 'replaced' | 'removed') {
    try {
      await this.remove(path);
      return true;
    } catch {
      this.logger.warn(
        `Certificate storage cleanup pending (${reason}); object identifier redacted.`,
      );
      return false;
    }
  }
}
