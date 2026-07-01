import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CertificateValidationStatus,
  FiscalEnvironment,
  Role,
} from '@prisma/client';
import { basename, extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CertificateCryptoService } from './certificate-crypto.service';
import {
  CertificateParserService,
  ParsedCertificate,
} from './certificate-parser.service';
import { CertificateStorageService } from './certificate-storage.service';

type UploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

const ALLOWED_MIME_TYPES = new Set([
  'application/x-pkcs12',
  'application/pkcs12',
  'application/octet-stream',
]);

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);
  private readonly maxSizeBytes =
    Number(process.env.CERTIFICATE_MAX_SIZE_MB || 5) * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly crypto: CertificateCryptoService,
    private readonly parser: CertificateParserService,
    private readonly storage: CertificateStorageService,
  ) {
    if (
      !Number.isFinite(this.maxSizeBytes) ||
      this.maxSizeBytes <= 0 ||
      this.maxSizeBytes > 20 * 1024 * 1024
    ) {
      throw new Error(
        'CERTIFICATE_MAX_SIZE_MB must be a number greater than 0 and at most 20.',
      );
    }
  }

  async upload(
    user: Express.AuthenticatedUser | undefined,
    file: UploadFile,
    password: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveAdmin(
      user,
      selectedBranchId,
      devContextMode,
    );
    this.assertFile(file);
    const config = await this.findConfig(context.tenantId, context.branchId!);
    const parsed = this.parser.parse(file.buffer!, password);
    this.assertCertificateCnpj(parsed, config.cnpj);

    const newPath = this.storage.createPath(
      context.tenantId,
      context.branchId!,
    );
    const encryptedPassword = this.crypto.encryptPassword(password, {
      tenantId: context.tenantId,
      branchId: context.branchId!,
      certificatePath: newPath,
    });
    const oldPath = config.certificatePath;

    await this.storage.upload(newPath, file.buffer!);
    let updated;
    try {
      updated = await this.prisma.companyFiscalConfig.update({
        where: {
          tenantId_branchId: {
            tenantId: context.tenantId,
            branchId: context.branchId!,
          },
        },
        data: {
          certificatePath: newPath,
          certificateOriginalName: sanitizeOriginalName(file.originalname!),
          certificateMimeType: file.mimetype || 'application/octet-stream',
          certificateSize: file.size ?? file.buffer!.length,
          certificatePasswordEncrypted: encryptedPassword,
          certificatePasswordKeyVersion: this.crypto.keyVersion,
          certificateUploadedAt: new Date(),
          ...this.metadata(parsed),
          certificateValidatedAt: new Date(),
          certificateValidationStatus: CertificateValidationStatus.valid,
          certificateValidationErrorCode: null,
        },
      });
    } catch (error) {
      await this.storage.cleanup(newPath, 'rollback');
      throw error;
    }

    if (oldPath && oldPath !== newPath) {
      await this.storage.cleanup(oldPath, 'replaced');
    }
    this.logger.log(
      `Fiscal credential updated for tenant ${context.tenantId}, branch ${context.branchId}. Sensitive fields redacted.`,
    );
    return { ok: true, certificate: this.safeStatus(updated) };
  }

  async validate(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveAdmin(
      user,
      selectedBranchId,
      devContextMode,
    );
    const config = await this.findConfig(context.tenantId, context.branchId!);
    if (!config.certificatePath || !config.certificatePasswordEncrypted) {
      throw new BadRequestException('Nenhum certificado A1 foi configurado.');
    }

    try {
      const password = this.crypto.decryptPassword(
        config.certificatePasswordEncrypted,
        {
          tenantId: context.tenantId,
          branchId: context.branchId!,
          certificatePath: config.certificatePath,
        },
      );
      const buffer = await this.storage.download(config.certificatePath);
      const parsed = this.parser.parse(buffer, password);
      this.assertCertificateCnpj(parsed, config.cnpj);
      const updated = await this.prisma.companyFiscalConfig.update({
        where: { id: config.id },
        data: {
          ...this.metadata(parsed),
          certificateValidatedAt: new Date(),
          certificateValidationStatus: CertificateValidationStatus.valid,
          certificateValidationErrorCode: null,
        },
      });
      return { ok: true, certificate: this.safeStatus(updated) };
    } catch (error) {
      const code = exceptionCode(error);
      const status =
        code === 'CERTIFICATE_EXPIRED'
          ? CertificateValidationStatus.expired
          : code === 'CERTIFICATE_CNPJ_MISMATCH'
            ? CertificateValidationStatus.cnpj_mismatch
            : code === 'CERTIFICATE_SECRET_DECRYPT_FAILED'
              ? CertificateValidationStatus.decrypt_error
              : CertificateValidationStatus.invalid;
      await this.prisma.companyFiscalConfig.update({
        where: { id: config.id },
        data: {
          certificateValidatedAt: new Date(),
          certificateValidationStatus: status,
          certificateValidationErrorCode: code,
        },
      });
      throw error;
    }
  }

  async remove(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveAdmin(
      user,
      selectedBranchId,
      devContextMode,
    );
    const config = await this.findConfig(context.tenantId, context.branchId!);
    const oldPath = config.certificatePath;
    await this.prisma.companyFiscalConfig.update({
      where: { id: config.id },
      data: {
        certificatePath: null,
        certificateOriginalName: null,
        certificateMimeType: null,
        certificateSize: null,
        certificatePasswordEncrypted: null,
        certificatePasswordKeyVersion: null,
        certificateUploadedAt: null,
        certificateValidFrom: null,
        certificateExpiresAt: null,
        certificateSubject: null,
        certificateIssuer: null,
        certificateSerialNumber: null,
        certificateCnpj: null,
        certificateFingerprintSha256: null,
        certificateValidatedAt: null,
        certificateValidationStatus: null,
        certificateValidationErrorCode: null,
        environment: FiscalEnvironment.homologacao,
        productionEnabledAt: null,
        productionEnabledById: null,
      },
    });
    if (oldPath) await this.storage.cleanup(oldPath, 'removed');
    this.logger.log(
      `Fiscal credential removed for tenant ${context.tenantId}, branch ${context.branchId}. Sensitive fields redacted.`,
    );
    return { ok: true, certificate: { present: false, status: 'absent' } };
  }

  async activateProduction(
    user: Express.AuthenticatedUser | undefined,
    confirmation: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveAdmin(
      user,
      selectedBranchId,
      devContextMode,
    );
    if (confirmation !== 'ATIVAR PRODUÇÃO') {
      throw new BadRequestException('Digite ATIVAR PRODUÇÃO para confirmar.');
    }
    const config = await this.findConfig(context.tenantId, context.branchId!);
    if (config.provider === 'mock') {
      throw new ServiceUnavailableException(
        'Producao exige um provider fiscal real. O provider mock nunca autoriza notas.',
      );
    }
    if (
      !config.certificatePath ||
      config.certificateValidationStatus !== CertificateValidationStatus.valid
    ) {
      throw new BadRequestException('Producao exige certificado A1 valido.');
    }
    if (
      !config.certificateExpiresAt ||
      config.certificateExpiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'Producao exige certificado A1 dentro da validade.',
      );
    }
    if (
      config.certificateCnpj &&
      digits(config.certificateCnpj) !== digits(config.cnpj)
    ) {
      throw new BadRequestException(
        'O CNPJ do certificado difere do CNPJ emitente.',
      );
    }
    if (
      !config.legalName?.trim() ||
      !config.cnpj?.trim() ||
      !config.street?.trim() ||
      !config.number?.trim() ||
      !config.district?.trim() ||
      !config.city?.trim() ||
      !/^\d{7}$/.test(digits(config.cityCodeIbge)) ||
      !/^[A-Z]{2}$/.test(config.state?.toUpperCase() || '') ||
      digits(config.zipCode).length !== 8
    ) {
      throw new BadRequestException(
        'A configuracao fiscal da filial esta incompleta.',
      );
    }
    const updated = await this.prisma.companyFiscalConfig.update({
      where: { id: config.id },
      data: {
        environment: FiscalEnvironment.producao,
        productionEnabledAt: new Date(),
        productionEnabledById: context.userId,
      },
    });
    this.logger.warn(
      `Fiscal production enabled for tenant ${context.tenantId}, branch ${context.branchId}, actor ${context.userId}.`,
    );
    return {
      ok: true,
      environment: updated.environment,
      productionEnabledAt: updated.productionEnabledAt,
    };
  }

  safeStatus(config: Record<string, any> | null) {
    if (!config?.certificatePath) {
      return { present: false, status: 'absent' };
    }
    return {
      present: true,
      status: config.certificateValidationStatus || 'pending',
      originalName: config.certificateOriginalName,
      mimeType: config.certificateMimeType,
      size: config.certificateSize,
      uploadedAt: config.certificateUploadedAt,
      validFrom: config.certificateValidFrom,
      expiresAt: config.certificateExpiresAt,
      subject: config.certificateSubject,
      issuer: config.certificateIssuer,
      serialNumber: config.certificateSerialNumber,
      cnpj: config.certificateCnpj,
      fingerprintSha256: config.certificateFingerprintSha256,
      validatedAt: config.certificateValidatedAt,
      validationErrorCode: config.certificateValidationErrorCode,
    };
  }

  private metadata(parsed: ParsedCertificate) {
    return {
      certificateValidFrom: parsed.validFrom,
      certificateExpiresAt: parsed.expiresAt,
      certificateSubject: parsed.subject,
      certificateIssuer: parsed.issuer,
      certificateSerialNumber: parsed.serialNumber,
      certificateCnpj: parsed.cnpj,
      certificateFingerprintSha256: parsed.fingerprintSha256,
    };
  }

  private assertFile(file: UploadFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum certificado foi enviado.');
    }
    const extension = extname(file.originalname || '').toLowerCase();
    if (!['.pfx', '.p12'].includes(extension)) {
      throw new BadRequestException(
        'Formato invalido. Envie um certificado .pfx ou .p12.',
      );
    }
    if (
      !file.mimetype ||
      !ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())
    ) {
      throw new BadRequestException(
        'O tipo do arquivo nao corresponde a um certificado PKCS#12.',
      );
    }
    if ((file.size ?? file.buffer.length) > this.maxSizeBytes) {
      throw new BadRequestException(
        `O certificado excede o limite de ${Math.round(this.maxSizeBytes / 1024 / 1024)}MB.`,
      );
    }
  }

  private assertCertificateCnpj(parsed: ParsedCertificate, configCnpj: string) {
    if (parsed.cnpj && digits(parsed.cnpj) !== digits(configCnpj)) {
      throw new BadRequestException({
        code: 'CERTIFICATE_CNPJ_MISMATCH',
        message: 'O CNPJ do certificado difere do CNPJ emitente.',
      });
    }
  }

  private async findConfig(tenantId: string, branchId: string) {
    const config = await this.prisma.companyFiscalConfig.findUnique({
      where: { tenantId_branchId: { tenantId, branchId } },
    });
    if (!config) {
      throw new NotFoundException(
        'Configure os dados fiscais da filial antes do certificado.',
      );
    }
    return config;
  }

  private async resolveAdmin(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowedRoles: [Role.Admin],
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
    if (context.isDevSuperAdmin) {
      throw new ForbiddenException(
        'Dev SuperAdmin nao pode operar certificados fiscais reais.',
      );
    }
    return context;
  }
}

function sanitizeOriginalName(value: string) {
  return basename(value)
    .replace(/[^\p{L}\p{N}._ -]/gu, '-')
    .slice(0, 180);
}

function digits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function exceptionCode(error: unknown) {
  const response = (error as any)?.getResponse?.();
  return typeof response === 'object' && response?.code
    ? String(response.code)
    : 'CERTIFICATE_VALIDATION_FAILED';
}
