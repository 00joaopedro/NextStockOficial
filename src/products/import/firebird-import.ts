import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

export const FIREBIRD_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const maxResponseBytes = 8 * 1024 * 1024;
let active = false;

function configuration() {
  const remote = process.env.NEXTSTOCK_FIREBIRD_READER_URL;
  const token = process.env.NEXTSTOCK_FIREBIRD_READER_TOKEN;
  if (!remote || !token || token.length < 32) return null;
  try {
    const url = new URL(remote);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return { url, token };
  } catch {
    return null;
  }
}

export function hasFirebirdReader() {
  return configuration() !== null;
}

export async function inspectFirebird(buffer?: Buffer, table?: string) {
  const config = configuration();
  if (!config)
    throw new ServiceUnavailableException(
      'Leitor Firebird direto indisponível. Exporte os produtos para CSV.',
    );
  if (
    !buffer?.length ||
    buffer.length > FIREBIRD_IMPORT_MAX_BYTES ||
    (table !== undefined &&
      (typeof table !== 'string' ||
        !table ||
        table.length > 512 ||
        table.includes('\0')))
  ) {
    throw new BadRequestException('Arquivo ou tabela Firebird inválidos.');
  }
  if (active)
    throw new ServiceUnavailableException(
      'Leitor Firebird ocupado. Tente novamente.',
    );
  active = true;
  try {
    const url = new URL('/inspect', config.url);
    if (table !== undefined) url.searchParams.set('table', table);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(buffer),
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Leitor Firebird temporariamente indisponível.',
      );
    }
    if (response.status === 422) {
      await response.body?.cancel();
      throw new BadRequestException(
        'Não foi possível ler a cópia Firebird 3. Se o banco for mais antigo, exporte CSV na origem ou use uma cópia convertida pelo suporte.',
      );
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new ServiceUnavailableException(
        'Leitor Firebird temporariamente indisponível.',
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxResponseBytes) throw new Error('size');
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new ServiceUnavailableException(
        'Resposta inválida do leitor Firebird.',
      );
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } finally {
    active = false;
  }
}
