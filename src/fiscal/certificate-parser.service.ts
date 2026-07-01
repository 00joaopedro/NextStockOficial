import { BadRequestException, Injectable } from '@nestjs/common';
import * as forge from 'node-forge';

export type ParsedCertificate = {
  subject: string;
  issuer: string;
  serialNumber: string;
  fingerprintSha256: string;
  validFrom: Date;
  expiresAt: Date;
  cnpj: string | null;
  hasPrivateKey: boolean;
};

@Injectable()
export class CertificateParserService {
  parse(buffer: Buffer, password: string): ParsedCertificate {
    if (!buffer?.length) {
      throw certificateError(
        'CERTIFICATE_EMPTY',
        'O arquivo do certificado esta vazio.',
      );
    }

    try {
      const binary = forge.util.createBuffer(buffer.toString('binary'));
      const asn1 = forge.asn1.fromDer(binary);
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
      const certificate = this.firstCertificate(p12);
      const hasPrivateKey = this.hasPrivateKey(p12);
      if (!certificate) {
        throw certificateError(
          'CERTIFICATE_MISSING_X509',
          'O PKCS#12 nao contem um certificado X.509.',
        );
      }
      if (!hasPrivateKey) {
        throw certificateError(
          'CERTIFICATE_MISSING_PRIVATE_KEY',
          'O certificado nao contem uma chave privada.',
        );
      }

      const now = new Date();
      if (certificate.validity.notAfter.getTime() < now.getTime()) {
        throw certificateError(
          'CERTIFICATE_EXPIRED',
          'O certificado digital esta expirado.',
        );
      }
      if (certificate.validity.notBefore.getTime() > now.getTime()) {
        throw certificateError(
          'CERTIFICATE_NOT_YET_VALID',
          'O certificado digital ainda nao e valido.',
        );
      }

      const der = forge.asn1
        .toDer(forge.pki.certificateToAsn1(certificate))
        .getBytes();
      const fingerprint = forge.md.sha256
        .create()
        .update(der)
        .digest()
        .toHex()
        .toUpperCase()
        .match(/.{1,2}/g)!
        .join(':');

      return {
        subject: this.distinguishedName(certificate.subject.attributes),
        issuer: this.distinguishedName(certificate.issuer.attributes),
        serialNumber: certificate.serialNumber.toUpperCase(),
        fingerprintSha256: fingerprint,
        validFrom: certificate.validity.notBefore,
        expiresAt: certificate.validity.notAfter,
        cnpj: this.extractCnpj(certificate.subject.attributes),
        hasPrivateKey,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = String((error as Error)?.message || '').toLowerCase();
      if (
        message.includes('invalid password') ||
        message.includes('mac could not be verified') ||
        message.includes('pkcs#12 mac could not be verified')
      ) {
        throw certificateError(
          'CERTIFICATE_INVALID_PASSWORD',
          'Nao foi possivel abrir o certificado. Confira a senha.',
        );
      }
      throw certificateError(
        'CERTIFICATE_INVALID_FILE',
        'O arquivo enviado nao e um certificado PKCS#12 valido.',
      );
    }
  }

  private firstCertificate(p12: forge.pkcs12.Pkcs12Pfx) {
    const result = p12.getBags({ bagType: forge.pki.oids.certBag });
    const bags = result[forge.pki.oids.certBag] || [];
    return bags.find((bag) => bag.cert)?.cert ?? null;
  }

  private hasPrivateKey(p12: forge.pkcs12.Pkcs12Pfx) {
    const directResult = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const shroudedResult = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    });
    const direct = directResult[forge.pki.oids.keyBag] || [];
    const shrouded = shroudedResult[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    return [...direct, ...shrouded].some((bag) => Boolean(bag.key));
  }

  private distinguishedName(attributes: forge.pki.CertificateField[]) {
    return attributes
      .map((attribute) => {
        const name =
          attribute.shortName || attribute.name || attribute.type || 'OID';
        return `${name}=${String(attribute.value).slice(0, 300)}`;
      })
      .join(', ')
      .slice(0, 2000);
  }

  private extractCnpj(attributes: forge.pki.CertificateField[]) {
    for (const attribute of attributes) {
      const value = String(attribute.value || '');
      const digits = value.replace(/\D/g, '');
      if (attribute.type === '2.16.76.1.3.3' && digits.length >= 14) {
        return digits.slice(-14);
      }
      const match = value.match(/(?:CNPJ\D*)?(\d{14})(?:\D|$)/i);
      if (match) return match[1];
    }
    return null;
  }
}

function certificateError(code: string, message: string) {
  return new BadRequestException({ code, message });
}
