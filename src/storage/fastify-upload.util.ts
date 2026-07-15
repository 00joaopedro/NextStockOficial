type MultipartField = {
  value?: unknown;
};

type MultipartFilePart = {
  filename?: string;
  mimetype?: string;
  file?: {
    bytesRead?: number;
  };
  toBuffer?: () => Promise<Buffer>;
  fields?: Record<string, MultipartField | unknown>;
};

export type CompatibleUploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type FastifyMultipartRequest = {
  file?: () => Promise<MultipartFilePart | undefined>;
};

export async function readFastifyUpload(
  req: unknown,
): Promise<{ file: CompatibleUploadFile; fields: Record<string, unknown> }> {
  const request = req as FastifyMultipartRequest;
  const part = await request.file?.();
  const buffer = part?.toBuffer ? await part.toBuffer() : Buffer.alloc(0);

  return {
    file: {
      originalname: part?.filename,
      mimetype: part?.mimetype,
      size: part?.file?.bytesRead ?? buffer.length,
      buffer,
    },
    fields: normalizeMultipartFields(part?.fields),
  };
}

function normalizeMultipartFields(
  fields?: Record<string, MultipartField | unknown>,
): Record<string, unknown> {
  if (!fields) return {};

  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      isMultipartField(field) ? field.value : field,
    ]),
  );
}

function isMultipartField(value: unknown): value is MultipartField {
  return Boolean(value && typeof value === 'object' && 'value' in value);
}
