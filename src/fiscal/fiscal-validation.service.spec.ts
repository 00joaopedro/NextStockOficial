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
  it('rejeita produto pesavel sem unidade tributavel e CSOSN para Simples', () => {
    expect(() => service.assertItems([{
      productNameSnapshot: 'Cafe por peso',
      isWeighableSnapshot: true,
      ncmSnapshot: '09012100',
      cfopSnapshot: '5102',
      unitSnapshot: 'KG',
      originSnapshot: '0',
      product: { taxableUnit: null, icmsCsosn: null },
    }], { crt: 1 } as any)).toThrow(/unidade tributável|CSOSN/);
  });

  it('aceita dados fiscais completos de produto pesavel', () => {
    expect(() => service.assertItems([{
      productNameSnapshot: 'Cafe por peso',
      isWeighableSnapshot: true,
      ncmSnapshot: '09012100',
      cfopSnapshot: '5102',
      unitSnapshot: 'KG',
      taxableUnitSnapshot: 'KG',
      originSnapshot: '0',
      icmsCsosnSnapshot: '102',
      ipiCodeSnapshot: '99',
      pisCodeSnapshot: '01',
      cofinsCodeSnapshot: '01',
      product: null,
    }], { crt: 1 } as any)).not.toThrow();
  });

  it('rejeita produto sem codigos de IPI, PIS e COFINS', () => {
    expect(() => service.assertItems([{
      productNameSnapshot: 'Cafe sem codigos',
      ncmSnapshot: '09012100',
      cfopSnapshot: '5102',
      unitSnapshot: 'KG',
      taxableUnitSnapshot: 'KG',
      originSnapshot: '0',
      icmsCsosnSnapshot: '102',
      ipiCodeSnapshot: null,
      pisCodeSnapshot: null,
      cofinsCodeSnapshot: null,
    }], { crt: 1 } as any)).toThrow(/IPI, PIS ou COFINS/);
  });

  it('bloqueia payload fiscal legado sem classificacao completa', () => {
    expect(() => service.assertStoredPayload({
      items: [{
        ncm: '09012100',
        cfop: '5102',
        unit: 'KG',
        taxableUnit: 'KG',
        origin: '0',
        icmsCsosn: '102',
        ipiCode: '',
        pisCode: '',
        cofinsCode: '',
      }],
    }, { crt: 1 } as any)).toThrow(/Rascunho fiscal antigo/);
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
