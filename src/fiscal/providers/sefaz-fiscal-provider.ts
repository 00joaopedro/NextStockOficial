import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as forge from 'node-forge';
import { createHash } from 'crypto';
import { request as httpsRequest } from 'https';
import { SaleDocumentStatus } from '@prisma/client';
import { CertificateCryptoService } from '../certificate-crypto.service';
import { CertificateStorageService } from '../certificate-storage.service';
import {
  FiscalProvider,
  FiscalProviderDocument,
  FiscalProviderResult,
  FiscalProviderSendError,
} from '../fiscal-provider.interface';

type SefazConfig = {
  authorizationUrl?: string;
  statusUrl?: string;
  cancellationUrl?: string;
  inutilizationUrl?: string;
  uf?: string;
  soapAction?: string;
  timeoutMs?: number;
};

type FiscalCredentials = {
  tenantId: string;
  branchId: string;
  certificatePath: string;
  certificatePasswordEncrypted: string;
};

type PreparedCertificate = {
  pfx: Buffer;
  password: string;
  certificateBase64: string;
};

const SOAP_NS = 'http://www.w3.org/2003/05/soap-envelope';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const UF_CODES: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32,
  GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41,
  PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42,
  SP: 35, SE: 28, TO: 17,
};

@Injectable()
export class SefazFiscalProvider implements FiscalProvider {
  readonly name = 'sefaz';
  readonly isRealProvider = true;

  constructor(
    private readonly certificateStorage: CertificateStorageService,
    private readonly certificateCrypto: CertificateCryptoService,
  ) {}

  async buildXml(document: FiscalProviderDocument) {
    const prepared = await this.prepareCertificate(document);
    return Buffer.from(
      this.signNfeXml(
        buildNfeXml(document),
        prepared,
      ),
      'utf8',
    );
  }

  async sendNfe55(document: FiscalProviderDocument) {
    return this.transmit(document, 55);
  }

  async sendNfce65(document: FiscalProviderDocument) {
    return this.transmit(document, 65);
  }

  async queryStatus(document: FiscalProviderDocument) {
    const config = this.config(document);
    const url = config.statusUrl;
    if (!url) {
      throw new ServiceUnavailableException(
        'Provider SEFAZ sem statusUrl configurada para esta filial.',
      );
    }
    const prepared = await this.prepareCertificate(document);
    const accessKey = String(
      document.payload.accessKey ||
        document.payload.chNFe ||
        '',
    ).replace(/\D/g, '');
    if (accessKey.length !== 44) {
      throw new BadRequestException(
        'Consulta SEFAZ exige a chave de acesso de 44 digitos.',
      );
    }
    const body = this.signRequest(
      `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${document.tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${accessKey}</chNFe></consSitNFe>`,
      prepared,
    );
    const response = await this.soap(url, body, config, prepared);
    return this.resultFromResponse(response, accessKey);
  }

  async cancel(document: FiscalProviderDocument, reason: string) {
    const config = this.config(document);
    const url = config.cancellationUrl;
    if (!url) {
      throw new ServiceUnavailableException(
        'Provider SEFAZ sem cancellationUrl configurada para esta filial.',
      );
    }
    const prepared = await this.prepareCertificate(document);
    const accessKey = String(
      document.payload.accessKey ||
        document.payload.chNFe ||
        '',
    ).replace(/\D/g, '');
    if (accessKey.length !== 44) {
      throw new BadRequestException(
        'Cancelamento SEFAZ exige a chave de acesso de 44 digitos.',
      );
    }
    const event = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><evento versao="1.00"><infEvento Id="ID110111${accessKey}01"><cOrgao>${escapeXml(config.uf || String(document.payload.issuerState || ''))}</cOrgao><tpAmb>${document.tpAmb}</tpAmb><CNPJ>${digits(String(document.payload.issuerCnpj || ''))}</CNPJ><chNFe>${accessKey}</chNFe><dhEvento>${new Date().toISOString().replace('Z', '-03:00')}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${escapeXml(String(document.payload.protocol || ''))}</nProt><xJust>${escapeXml(reason.trim())}</xJust></detEvento></infEvento></evento></envEvento>`;
    const body = this.signRequest(event, prepared);
    const response = await this.soap(url, body, config, prepared);
    const parsed = this.resultFromResponse(response, accessKey);
    return {
      ...parsed,
      status: parsed.status === SaleDocumentStatus.authorized
        ? SaleDocumentStatus.canceled
        : parsed.status,
    };
  }

  async generateDanfe(document: FiscalProviderDocument) {
    return renderMinimalPdf(document);
  }

  private async transmit(document: FiscalProviderDocument, model: 55 | 65) {
    const config = this.config(document);
    if (!config.authorizationUrl) {
      throw new ServiceUnavailableException(
        'Provider SEFAZ sem authorizationUrl configurada para esta filial.',
      );
    }
    const prepared = await this.prepareCertificate(document);
    const unsigned = buildNfeXml(document, model);
    const signed = this.signNfeXml(unsigned, prepared);
    try {
      const response = await this.soap(
        config.authorizationUrl,
        `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${Date.now().toString().slice(-15)}</idLote><indSinc>1</indSinc>${signed}</enviNFe>`,
        config,
        prepared,
      );
      const result = this.resultFromResponse(response, extractAccessKey(unsigned));
      if (result.status === SaleDocumentStatus.authorized) {
        return {
          ...result,
          xml: Buffer.from(response.includes('<nfeProc') ? response : signed, 'utf8'),
          pdf: await this.generateDanfe({ ...document, payload: { ...document.payload, accessKey: result.accessKey } }),
        };
      }
      return result;
    } catch (error) {
      if (error instanceof FiscalProviderSendError) throw error;
      throw new FiscalProviderSendError(
        error instanceof Error ? error.message : 'Falha de comunicação com a SEFAZ.',
        'UNKNOWN',
      );
    }
  }

  private config(document: FiscalProviderDocument): SefazConfig {
    const config = (document.providerConfig || {}) as SefazConfig;
    if (!config.uf || !/^[A-Z]{2}$/.test(config.uf.toUpperCase())) {
      throw new BadRequestException(
        'Provider SEFAZ exige a UF da filial em providerConfig.uf.',
      );
    }
    return { ...config, uf: config.uf.toUpperCase() };
  }

  private async prepareCertificate(document: FiscalProviderDocument) {
    const credentials = document.credentials;
    if (!credentials) {
      throw new ServiceUnavailableException(
        'Credenciais do certificado A1 não foram disponibilizadas ao provider SEFAZ.',
      );
    }
    const encrypted = await this.certificateStorage.download(
      credentials.certificatePath,
    );
    const password = this.certificateCrypto.decryptPassword(
      credentials.certificatePasswordEncrypted,
      {
        tenantId: credentials.tenantId,
        branchId: credentials.branchId,
        certificatePath: credentials.certificatePath,
      },
    );
    const pfx = encrypted.toString('utf8').startsWith('a1blob:')
      ? this.certificateCrypto.decryptCertificate(encrypted, {
          tenantId: credentials.tenantId,
          branchId: credentials.branchId,
          certificatePath: credentials.certificatePath,
        })
      : encrypted;
    const parsed = parsePkcs12(pfx, password);
    return { pfx, password, certificateBase64: parsed.certificateBase64 };
  }

  private signRequest(xml: string, certificate: PreparedCertificate) {
    return this.signNfeXml(xml, certificate);
  }

  private signNfeXml(xml: string, certificate: PreparedCertificate) {
    const match = xml.match(/<(infNFe|infEvento)\\b[^>]*\\bId="([^"]+)"[^>]*>/);
    if (!match) return xml;
    const rootTag = match[1];
    const inf = xml.match(new RegExp(`<${rootTag}\\b[\\s\\S]*?<\\/${rootTag}>`))?.[0];
    if (!inf) return xml;
    const digest = sha1Base64(inf);
    const signedInfo = `<SignedInfo xmlns="${DSIG_NS}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#${match[2]}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
    const key = parsePkcs12PrivateKey(certificate.pfx, certificate.password);
    const md = forge.md.sha1.create();
    md.update(signedInfo, 'utf8');
    const signature = forge.util.encode64(key.sign(md));
    const signatureXml = `<Signature xmlns="${DSIG_NS}">${signedInfo}<SignatureValue>${signature}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certificate.certificateBase64}</X509Certificate></X509Data></KeyInfo></Signature>`;
    return xml.replace(`</${rootTag}>`, `</${rootTag}>${signatureXml}`);
  }

  private async soap(
    url: string,
    body: string,
    config: SefazConfig,
    certificate: PreparedCertificate,
  ) {
    const parsed = new URL(url);
    const envelope = `<soap:Envelope xmlns:soap="${SOAP_NS}"><soap:Header/><soap:Body>${body}</soap:Body></soap:Envelope>`;
    return new Promise<string>((resolve, reject) => {
      const req = httpsRequest(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/soap+xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(envelope),
            ...(config.soapAction ? { SOAPAction: config.soapAction } : {}),
          },
          pfx: certificate.pfx,
          passphrase: certificate.password,
          rejectUnauthorized: true,
          timeout: config.timeoutMs || 30_000,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if ((response.statusCode || 500) >= 400) {
              reject(new Error(`SEFAZ HTTP ${response.statusCode}: ${text.slice(0, 300)}`));
            } else {
              resolve(text);
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('SEFAZ_TIMEOUT')));
      req.on('error', reject);
      req.write(envelope);
      req.end();
    });
  }

  private resultFromResponse(response: string, accessKey: string) {
    const cStat = Number(textTag(response, 'cStat') || '0');
    const xMotivo = textTag(response, 'xMotivo') || 'Resposta SEFAZ sem motivo.';
    const providerRef = textTag(response, 'nProt') || textTag(response, 'nRec');
    const responseKey = digits(textTag(response, 'chNFe') || accessKey);
    const authorized = [100, 150].includes(cStat);
    const processing = [103, 105, 106, 107, 108, 109].includes(cStat);
    return {
      status: authorized
        ? SaleDocumentStatus.authorized
        : processing
          ? SaleDocumentStatus.processing
          : SaleDocumentStatus.rejected,
      providerRef,
      accessKey: responseKey.length === 44 ? responseKey : accessKey,
      protocol: textTag(response, 'nProt'),
      response: {
        provider: this.name,
        cStat,
        xMotivo,
        rawLength: response.length,
      },
      errorMessage: authorized || processing ? undefined : `SEFAZ rejeitou o documento (${cStat}): ${xMotivo}`,
    };
  }
}

function buildNfeXml(document: FiscalProviderDocument, model = Number(document.model) === 65 ? 65 : 55) {
  const payload = document.payload as any;
  const issuer = (payload.issuer || {}) as any;
  const recipient = (payload.recipient || {}) as any;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const access = makeAccessKey(document, model);
  const infId = `NFe${access}`;
  const det = items.map((item: any, index: number) => {
    const quantity = Number(item.quantity || 0);
    const total = Number(item.totalPriceCents || 0) / 100;
    return `<det nItem="${index + 1}"><prod><cProd>${escapeXml(String(item.sku || item.saleItemId || index + 1))}</cProd><xProd>${escapeXml(String(item.description || ''))}</xProd><NCM>${digits(String(item.ncm || ''))}</NCM><CFOP>${digits(String(item.cfop || ''))}</CFOP><uCom>${escapeXml(String(item.unit || 'UN'))}</uCom><qCom>${decimal(quantity)}</qCom><vUnCom>${money(Number(item.unitPriceCents || 0) / 100 / Math.max(quantity, 1))}</vUnCom><vProd>${money(total)}</vProd><uTrib>${escapeXml(String(item.taxableUnit || item.unit || 'UN'))}</uTrib><qTrib>${decimal(quantity)}</qTrib><vUnTrib>${money(Number(item.unitPriceCents || 0) / 100 / Math.max(quantity, 1))}</vUnTrib></prod><imposto><ICMS><ICMSSN102><orig>${digits(String(item.origin || '0'))}</orig><CSOSN>${digits(String(item.icmsCsosn || '102'))}</CSOSN></ICMSSN102></ICMS><IPI><cEnq>999</cEnq><IPITrib><CST>${digits(String(item.ipiCode || '99'))}</CST><vBC>0.00</vBC><pIPI>0.00</pIPI><vIPI>0.00</vIPI></IPITrib></IPI><PIS><PISOutr><CST>${digits(String(item.pisCode || '99'))}</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>${digits(String(item.cofinsCode || '99'))}</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>`;
  }).join('');
  const dest = recipient.document ? `<dest><${recipient.documentType === 'cnpj' ? 'CNPJ' : 'CPF'}>${digits(String(recipient.document))}</${recipient.documentType === 'cnpj' ? 'CNPJ' : 'CPF'}><xNome>${escapeXml(String(recipient.name || ''))}</xNome><enderDest><xLgr>${escapeXml(String(recipient.street || ''))}</xLgr><nro>${escapeXml(String(recipient.number || ''))}</nro><xBairro>${escapeXml(String(recipient.district || ''))}</xBairro><cMun>${digits(String(recipient.cityCodeIbge || ''))}</cMun><xMun>${escapeXml(String(recipient.city || ''))}</xMun><UF>${escapeXml(String(recipient.state || ''))}</UF><CEP>${digits(String(recipient.zipCode || ''))}</CEP></enderDest><indIEDest>${digits(String(recipient.ieIndicator || '9'))}</indIEDest></dest>` : '';
  const ide = `<ide><cUF>${String(ufCode(String(document.providerConfig?.uf || issuer.state || '0'))).padStart(2, '0')}</cUF><cNF>${access.slice(-8)}</cNF><natOp>${escapeXml(String(payload.operationNature || 'Venda de mercadoria'))}</natOp><mod>${model}</mod><serie>${escapeXml(document.series)}</serie><nNF>${escapeXml(document.number)}</nNF><dhEmi>${new Date().toISOString()}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><tpImp>${model === 65 ? 4 : 1}</tpImp><tpEmis>1</tpEmis><cDV>${access.slice(-1)}</cDV><tpAmb>${document.tpAmb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>NextStock</verProc></ide>`;
  const total = items.reduce((sum: number, item: any) => sum + Number(item.totalPriceCents || 0), 0) / 100;
  const issuerXml = `<emit><CNPJ>${digits(String(issuer.cnpj || ''))}</CNPJ><xNome>${escapeXml(String(issuer.legalName || ''))}</xNome><xFant>${escapeXml(String(issuer.tradeName || issuer.legalName || ''))}</xFant><enderEmit><xLgr>${escapeXml(String(issuer.street || ''))}</xLgr><nro>${escapeXml(String(issuer.number || ''))}</nro><xBairro>${escapeXml(String(issuer.district || ''))}</xBairro><cMun>${digits(String(issuer.cityCodeIbge || ''))}</cMun><xMun>${escapeXml(String(issuer.city || ''))}</xMun><UF>${escapeXml(String(issuer.state || ''))}</UF><CEP>${digits(String(issuer.zipCode || ''))}</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderEmit><IE>${digits(String(issuer.stateRegistration || ''))}</IE><CRT>${Number(issuer.crt || 1)}</CRT></emit>`;
  const totalXml = `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${money(total)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${money(Number(payload.totals?.discountCents || 0) / 100)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${money(total)}</vNF></ICMSTot></total>`;
  const pag = `<pag><detPag><tPag>01</tPag><vPag>${money(total)}</vPag></detPag></pag>`;
  const inf = `<infNFe Id="${infId}" versao="4.00">${ide}${issuerXml}${dest}${det}<transp><modFrete>9</modFrete></transp>${totalXml}${pag}<infAdic><infCpl>${escapeXml(String(payload.additionalInformation || ''))}</infCpl></infAdic></infNFe>`;
  return `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${inf}</NFe>`;
}

function parsePkcs12(buffer: Buffer, password: string) {
  const p12 = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(buffer.toString('binary')),
    false,
    password,
  ) as any;
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const cert = bags[forge.pki.oids.certBag]?.[0]?.cert;
  if (!cert) throw new BadRequestException('Certificado A1 sem certificado X509.');
  return {
    certificateBase64: forge.util.encode64(
      forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
    ),
  };
}

function parsePkcs12PrivateKey(buffer: Buffer, password: string) {
  const p12 = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(buffer.toString('binary')),
    false,
    password,
  ) as any;
  const bags = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
  });
  const bag = bags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!bag?.key) throw new BadRequestException('Certificado A1 sem chave privada.');
  return bag.key as forge.pki.rsa.PrivateKey;
}

function makeAccessKey(document: FiscalProviderDocument, model: number) {
  const payload = document.payload as any;
  const issuer = payload.issuer || {};
  const cnpj = digits(String(issuer.cnpj || ''));
  const uf = ufCode(String(document.providerConfig?.uf || issuer.state || ''));
  const aamm = new Date().toISOString().slice(2, 7).replace('-', '');
  const series = String(document.series).padStart(3, '0').slice(-3);
  const number = String(document.number).padStart(9, '0').slice(-9);
  const random = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  const base = `${String(uf).padStart(2, '0')}${aamm}${cnpj}${model}${series}${number}1${random}`;
  return base + mod11(base);
}

function extractAccessKey(xml: string) {
  return xml.match(/Id="NFe(\d{44})"/)?.[1] || '';
}

function mod11(value: string) {
  let weight = 2;
  let sum = 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    sum += Number(value[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
}

function textTag(xml: string, tag: string) {
  return xml.match(new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}>([^<]*)</(?:[A-Za-z0-9_]+:)?${tag}>`))?.[1]?.trim() || '';
}

function sha1Base64(value: string) {
  return createHash('sha1').update(value, 'utf8').digest('base64');
}

function ufCode(value: string) {
  const normalized = value.toUpperCase().trim();
  return UF_CODES[normalized] || Number(digits(normalized)) || 0;
}

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function decimal(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : '0.0000';
}

function money(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderMinimalPdf(document: FiscalProviderDocument) {
  const payload = document.payload as any;
  const issuer = payload.issuer || {};
  const lines = [
    'DANFE / NFC-e autorizado',
    `Documento: modelo ${document.model} numero ${document.number}`,
    `Emitente: ${issuer.legalName || ''}`,
    `CNPJ: ${issuer.cnpj || ''}`,
    `Chave: ${payload.accessKey || 'consultar retorno SEFAZ'}`,
    'Representacao simplificada para conferencia e impressao.',
  ];
  const stream = `BT /F1 10 Tf 40 780 Td ${pdfText(lines.join('\\n'))} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

function pdfText(value: string) {
  return value
    .split('\n')
    .map((line, index) => `(${line.replace(/[()\\]/g, '\\$&')}) Tj ${index ? '0 -18 Td ' : ''}`)
    .join('');
}
