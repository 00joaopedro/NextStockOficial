import { SaleDocumentStatus } from '@prisma/client';

export type FiscalProviderDocument = {
  documentId: string;
  model: string;
  environment: string;
  tpAmb: 1 | 2;
  series: string;
  number: string;
  payload: Record<string, unknown>;
};

export type FiscalProviderResult = {
  status: SaleDocumentStatus;
  providerRef?: string;
  accessKey?: string;
  protocol?: string;
  xml?: Buffer;
  pdf?: Buffer;
  response?: Record<string, unknown>;
  errorMessage?: string;
};

/** Providers must only use NOT_SENT when they can prove no request left the process. */
export class FiscalProviderSendError extends Error {
  constructor(
    message: string,
    readonly dispatchState: 'NOT_SENT' | 'UNKNOWN',
  ) {
    super(message);
    this.name = 'FiscalProviderSendError';
  }
}

export interface FiscalProvider {
  readonly name: string;
  readonly isRealProvider: boolean;
  buildXml(document: FiscalProviderDocument): Promise<Buffer | null>;
  sendNfe55(document: FiscalProviderDocument): Promise<FiscalProviderResult>;
  sendNfce65(document: FiscalProviderDocument): Promise<FiscalProviderResult>;
  queryStatus(document: FiscalProviderDocument): Promise<FiscalProviderResult>;
  cancel(
    document: FiscalProviderDocument,
    reason: string,
  ): Promise<FiscalProviderResult>;
  generateDanfe(document: FiscalProviderDocument): Promise<Buffer | null>;
}
