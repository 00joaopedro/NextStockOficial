import { Injectable } from '@nestjs/common';
import { SaleDocumentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  FiscalProvider,
  FiscalProviderDocument,
  FiscalProviderResult,
} from '../fiscal-provider.interface';

@Injectable()
export class MockFiscalProvider implements FiscalProvider {
  readonly name = 'mock';
  readonly isRealProvider = false;

  async buildXml(_document: FiscalProviderDocument): Promise<Buffer | null> {
    return null;
  }

  async sendNfe55(
    _document: FiscalProviderDocument,
  ): Promise<FiscalProviderResult> {
    return {
      status: SaleDocumentStatus.processing,
      providerRef: `mock-${randomUUID()}`,
      response: {
        simulated: true,
        message:
          'Provider fiscal real nao configurado. Documento mantido em processamento sem autorizacao SEFAZ.',
      },
    };
  }

  async sendNfce65(
    _document: FiscalProviderDocument,
  ): Promise<FiscalProviderResult> {
    return {
      status: SaleDocumentStatus.processing,
      response: {
        simulated: true,
        authorized: false,
        message:
          'Provider mock nao transmite NFC-e e nunca produz autorizacao SEFAZ.',
      },
      errorMessage:
        'NFC-e fiscal indisponivel; nenhuma autorizacao foi simulada.',
    };
  }

  async queryStatus(
    document: FiscalProviderDocument,
  ): Promise<FiscalProviderResult> {
    return {
      status: SaleDocumentStatus.processing,
      providerRef: `mock-query-${document.documentId}`,
      response: {
        simulated: true,
        message: 'Provider mock nao consulta a SEFAZ.',
      },
    };
  }

  async cancel(
    _document: FiscalProviderDocument,
    _reason: string,
  ): Promise<FiscalProviderResult> {
    return {
      status: SaleDocumentStatus.rejected,
      response: {
        simulated: true,
        message: 'Provider mock nao pode cancelar documento fiscal autorizado.',
      },
      errorMessage: 'Cancelamento fiscal exige provider real.',
    };
  }

  async generateDanfe(
    _document: FiscalProviderDocument,
  ): Promise<Buffer | null> {
    return null;
  }
}
