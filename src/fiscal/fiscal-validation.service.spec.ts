import { BadRequestException } from '@nestjs/common';
import {
  FiscalEnvironment,
  SaleDocumentStatus,
  SaleStatus,
} from '@prisma/client';
import { FiscalValidationService } from './fiscal-validation.service';
import { MockFiscalProvider } from './providers/mock-fiscal-provider';

describe('FiscalValidationService', () => {
  const service = new FiscalValidationService();

  it('aceita destinatario fiscal completo e documentos validos', () => {
    expect(() =>
      service.assertRecipient({
        name: 'Cliente Fiscal',
        documentType: 'cpf',
        document: '529.982.247-25',
        ieIndicator: '9',
        street: 'Rua Teste',
        number: '10',
        district: 'Centro',
        city: 'Sao Paulo',
        cityCodeIbge: '3550308',
        state: 'SP',
        zipCode: '01001-000',
      }),
    ).not.toThrow();
  });

  it('rejeita produto sem classificacao fiscal minima', () => {
    expect(() =>
      service.assertItems([
        {
          productNameSnapshot: 'Produto incompleto',
          ncmSnapshot: null,
          cfopSnapshot: null,
          unitSnapshot: null,
          originSnapshot: null,
          product: null,
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejeita venda nao paga', () => {
    expect(() =>
      service.assertSaleEligible({
        status: SaleStatus.pending,
        order: null,
        items: [
          {
            productNameSnapshot: 'Produto',
            ncmSnapshot: '23091000',
            cfopSnapshot: '5102',
            unitSnapshot: 'UN',
            originSnapshot: '0',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('sanitiza segredos de respostas/configuracoes de provider', () => {
    expect(
      service.sanitizeProviderPayload({
        status: 'ok',
        token: 'sensitive',
        certificatePassword: 'sensitive',
      }),
    ).toEqual({ status: 'ok' });
  });
});

describe('MockFiscalProvider', () => {
  it('nunca retorna authorized', async () => {
    const provider = new MockFiscalProvider();
    const result = await provider.sendNfe55({
      documentId: 'document',
      model: '55',
      environment: FiscalEnvironment.homologacao,
      tpAmb: 2,
      series: '1',
      number: '1',
      payload: {},
    });

    expect(provider.isRealProvider).toBe(false);
    expect(result.status).toBe(SaleDocumentStatus.processing);
    expect(result.status).not.toBe(SaleDocumentStatus.authorized);

    const nfce = await provider.sendNfce65({
      documentId: 'document-65',
      model: '65',
      environment: FiscalEnvironment.homologacao,
      tpAmb: 2,
      series: '1',
      number: '1',
      payload: {},
    });
    expect(nfce.status).not.toBe(SaleDocumentStatus.authorized);
    expect(nfce.accessKey).toBeUndefined();
    expect(nfce.protocol).toBeUndefined();
    expect(nfce.xml).toBeUndefined();
    expect(nfce.pdf).toBeUndefined();
  });
});
