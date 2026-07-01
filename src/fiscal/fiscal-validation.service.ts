import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CertificateValidationStatus,
  FiscalEnvironment,
  SaleStatus,
} from '@prisma/client';
import { FiscalRecipientDto } from './dto/create-nfe55-document.dto';

type FiscalConfigInput = {
  cnpj: string;
  stateRegistration: string | null;
  crt: number;
  street: string;
  number: string;
  district: string;
  city: string;
  cityCodeIbge: string;
  state: string;
  zipCode: string;
  provider: string;
  certificateSecretRef: string | null;
  certificatePath?: string | null;
  certificatePasswordEncrypted?: string | null;
  certificateValidationStatus?: CertificateValidationStatus | null;
  certificateExpiresAt?: Date | null;
  environment: FiscalEnvironment;
};

type FiscalSaleInput = {
  status: SaleStatus;
  order?: { status: string } | null;
  items: Array<{
    productNameSnapshot: string;
    ncmSnapshot?: string | null;
    cfopSnapshot?: string | null;
    unitSnapshot?: string | null;
    originSnapshot?: string | null;
    product?: {
      ncm?: string | null;
      cfopDefault?: string | null;
      unit?: string | null;
      origin?: string | null;
    } | null;
  }>;
};

@Injectable()
export class FiscalValidationService {
  assertSaleEligible(sale: FiscalSaleInput) {
    if (sale.status !== SaleStatus.paid) {
      throw new BadRequestException(
        'NF-e exige uma venda com pagamento confirmado.',
      );
    }
    if (sale.order && ['canceled', 'refunded'].includes(sale.order.status)) {
      throw new BadRequestException(
        'Pedido cancelado ou estornado nao pode emitir NF-e.',
      );
    }
    if (!sale.items.length) {
      throw new BadRequestException(
        'A venda nao possui itens para emissao fiscal.',
      );
    }
  }

  assertConfig(config: FiscalConfigInput | null, forSending = false) {
    if (!config) {
      throw new BadRequestException(
        'Configure os dados fiscais da filial antes de criar a NF-e.',
      );
    }
    if (!this.isValidCnpj(config.cnpj)) {
      throw new BadRequestException('CNPJ do emitente e invalido.');
    }
    if (
      !config.crt ||
      !config.street?.trim() ||
      !config.number?.trim() ||
      !config.district?.trim() ||
      !config.city?.trim() ||
      !/^\d{7}$/.test(this.digits(config.cityCodeIbge)) ||
      !/^[A-Z]{2}$/.test(config.state.toUpperCase()) ||
      this.digits(config.zipCode).length !== 8
    ) {
      throw new BadRequestException(
        'Configuracao fiscal da filial esta incompleta.',
      );
    }
    if (
      forSending &&
      config.provider !== 'mock' &&
      !config.certificateSecretRef &&
      (!config.certificatePath || !config.certificatePasswordEncrypted)
    ) {
      throw new BadRequestException(
        'Provider fiscal real exige referencia segura do certificado.',
      );
    }
    if (
      forSending &&
      config.provider !== 'mock' &&
      config.certificatePath &&
      (config.certificateValidationStatus !==
        CertificateValidationStatus.valid ||
        !config.certificateExpiresAt ||
        config.certificateExpiresAt <= new Date())
    ) {
      throw new BadRequestException(
        'Provider fiscal real exige certificado A1 valido e dentro da validade.',
      );
    }
  }

  assertRecipient(recipient: FiscalRecipientDto) {
    const document = this.digits(recipient.document);
    if (recipient.documentType === 'cpf' && !this.isValidCpf(document)) {
      throw new BadRequestException('CPF do destinatario e invalido.');
    }
    if (recipient.documentType === 'cnpj' && !this.isValidCnpj(document)) {
      throw new BadRequestException('CNPJ do destinatario e invalido.');
    }
    if (
      recipient.documentType !== 'estrangeiro' &&
      !['1', '2', '9'].includes(recipient.ieIndicator)
    ) {
      throw new BadRequestException(
        'Indicador de IE do destinatario e invalido.',
      );
    }
    if (
      !recipient.name?.trim() ||
      !recipient.street?.trim() ||
      !recipient.number?.trim() ||
      !recipient.district?.trim() ||
      !recipient.city?.trim() ||
      !/^\d{7}$/.test(this.digits(recipient.cityCodeIbge)) ||
      !/^[A-Z]{2}$/.test(recipient.state.toUpperCase()) ||
      this.digits(recipient.zipCode).length !== 8
    ) {
      throw new BadRequestException(
        'Dados fiscais do destinatario estao incompletos.',
      );
    }
  }

  assertItems(items: FiscalSaleInput['items']) {
    const invalid = items.find((item) => {
      const ncm = item.ncmSnapshot || item.product?.ncm;
      const cfop = item.cfopSnapshot || item.product?.cfopDefault;
      const unit = item.unitSnapshot || item.product?.unit;
      const origin = item.originSnapshot || item.product?.origin;
      return (
        !/^\d{8}$/.test(this.digits(ncm)) ||
        !/^\d{4}$/.test(this.digits(cfop)) ||
        !unit?.trim() ||
        !origin?.trim()
      );
    });

    if (invalid) {
      throw new BadRequestException(
        `Produto "${invalid.productNameSnapshot}" sem NCM, CFOP, unidade ou origem fiscal valida.`,
      );
    }
  }

  sanitizeProviderPayload(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const blocked = /token|secret|password|certificate|xml/i;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !blocked.test(key))
        .map(([key, item]) => [key, this.sanitizeProviderValue(item, blocked)]),
    );
  }

  digits(value?: string | null) {
    return (value || '').replace(/\D/g, '');
  }

  private sanitizeProviderValue(value: unknown, blocked: RegExp): unknown {
    if (typeof value === 'string') return value.slice(0, 1000);
    if (Array.isArray(value)) {
      return value
        .slice(0, 100)
        .map((item) => this.sanitizeProviderValue(item, blocked));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !blocked.test(key))
          .map(([key, item]) => [
            key,
            this.sanitizeProviderValue(item, blocked),
          ]),
      );
    }
    return value;
  }

  private isValidCpf(value: string) {
    const digits = this.digits(value);
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
    const check = (size: number) => {
      let sum = 0;
      for (let index = 0; index < size; index += 1) {
        sum += Number(digits[index]) * (size + 1 - index);
      }
      const remainder = (sum * 10) % 11;
      return (remainder === 10 ? 0 : remainder) === Number(digits[size]);
    };
    return check(9) && check(10);
  }

  private isValidCnpj(value: string) {
    const digits = this.digits(value);
    if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
    const calculate = (length: number) => {
      const weights =
        length === 12
          ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = weights.reduce(
        (total, weight, index) => total + Number(digits[index]) * weight,
        0,
      );
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return (
      calculate(12) === Number(digits[12]) &&
      calculate(13) === Number(digits[13])
    );
  }
}
