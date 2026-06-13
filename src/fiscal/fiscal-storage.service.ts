import { Injectable } from '@nestjs/common';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

@Injectable()
export class FiscalStorageService {
  constructor(private readonly storage: SupabaseStorageService) {}

  uploadXml(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    documentId: string;
    content: Buffer;
  }) {
    return this.storage.uploadFiscalXml(input);
  }

  uploadPdf(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    documentId: string;
    content: Buffer;
  }) {
    return this.storage.uploadFiscalPdf(input);
  }

  createSignedUrl(storagePath?: string | null) {
    return this.storage.createSignedSaleDocumentUrl(storagePath);
  }

  remove(storagePath?: string | null) {
    return this.storage.removeFiscalFile(storagePath);
  }
}
