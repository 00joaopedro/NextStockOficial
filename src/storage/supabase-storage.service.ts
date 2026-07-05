import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ExpenseFileType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ImageOptimizerService,
  OptimizedImage,
} from './image-optimizer.service';
import { StoredFileScanStatus, StoredFileVisibility } from '@prisma/client';
import { StoredFilesService } from './stored-files.service';
import { UploadQuotaService } from './upload-quota.service';
import { FileScanner } from './file-scanner.interface';

type UploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXPENSE_TYPES = new Map<string, ExpenseFileType>([
  ['image/jpeg', ExpenseFileType.image],
  ['image/png', ExpenseFileType.image],
  ['image/webp', ExpenseFileType.image],
  ['image/gif', ExpenseFileType.image],
  ['application/pdf', ExpenseFileType.pdf],
  ['application/msword', ExpenseFileType.word],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ExpenseFileType.word,
  ],
]);

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly petPhotosBucket =
    process.env.SUPABASE_STORAGE_BUCKET_PET_PHOTOS || 'pet-photos';
  private readonly petPhotoMaxSizeBytes =
    Number(process.env.PET_PHOTO_MAX_SIZE_MB || 5) * 1024 * 1024;
  private readonly productImageMaxSizeBytes =
    Number(process.env.PRODUCT_IMAGE_MAX_SIZE_MB || 5) * 1024 * 1024;
  private readonly expenseFileMaxSizeBytes =
    Number(process.env.EXPENSE_FILE_MAX_SIZE_MB || 10) * 1024 * 1024;
  private readonly useSignedUrls =
    process.env.SUPABASE_STORAGE_SIGNED_URLS === 'true';

  constructor(
    private readonly supabase: SupabaseService,
    @Optional()
    private readonly imageOptimizer: ImageOptimizerService = new ImageOptimizerService(),
    @Optional() private readonly storedFiles?: StoredFilesService,
    @Optional() private readonly quotas?: UploadQuotaService,
    @Optional() private readonly scanner?: FileScanner,
  ) {}

  async uploadPetPhoto(input: {
    tenantId: string;
    branchId: string;
    petId: string;
    ownerProfileId?: string | null;
    file: UploadFile;
  }) {
    this.assertImage(input.file, this.petPhotoMaxSizeBytes);
    await this.quotas?.assertAllowed({
      tenantId: input.tenantId,
      ownerProfileId: input.ownerProfileId,
      incomingBytes: input.file.buffer!.length,
      incomingFiles: 3,
    });

    const originalName = this.cleanFileName(
      input.file.originalname || 'pet-photo',
    );
    const optimized = await this.imageOptimizer.optimize(input.file);
    const basePath = [
      input.tenantId,
      input.branchId,
      input.petId,
      randomUUID(),
    ].join('/');
    return this.uploadImageVariants(this.petPhotosBucket, basePath, optimized, {
      fileName: originalName,
      tenantId: input.tenantId,
      branchId: input.branchId,
      ownerProfileId: input.ownerProfileId,
      module: 'pets',
      targetType: 'pet',
      targetId: input.petId,
    });
  }

  async uploadProductImage(input: {
    tenantId: string;
    branchId: string;
    productId: string;
    ownerProfileId?: string | null;
    file: UploadFile;
  }) {
    this.assertImage(input.file, this.productImageMaxSizeBytes);
    await this.quotas?.assertAllowed({
      tenantId: input.tenantId,
      ownerProfileId: input.ownerProfileId,
      incomingBytes: input.file.buffer!.length,
      incomingFiles: 3,
    });

    const originalName = this.cleanFileName(
      input.file.originalname || 'product-image',
    );
    const optimized = await this.imageOptimizer.optimize(input.file);
    const basePath = [
      input.tenantId,
      input.branchId,
      'products',
      input.productId,
      randomUUID(),
    ].join('/');

    const bucket = this.getProductImagesBucket();
    return this.uploadImageVariants(bucket, basePath, optimized, {
      fileName: originalName,
      tenantId: input.tenantId,
      branchId: input.branchId,
      ownerProfileId: input.ownerProfileId,
      module: 'products',
      targetType: 'product',
      targetId: input.productId,
    });
  }

  async uploadExpenseFile(input: {
    tenantId: string;
    branchId: string;
    expenseId: string;
    ownerProfileId?: string | null;
    file: UploadFile;
  }) {
    const fileType = this.assertExpenseFile(
      input.file,
      this.expenseFileMaxSizeBytes,
    );
    await this.quotas?.assertAllowed({
      tenantId: input.tenantId,
      ownerProfileId: input.ownerProfileId,
      incomingBytes: input.file.buffer!.length,
    });

    const originalName = this.cleanFileName(
      input.file.originalname || 'expense-file',
    );
    if (fileType === ExpenseFileType.image) {
      const optimized = await this.imageOptimizer.optimize(input.file);
      const storagePath = [
        input.tenantId,
        input.branchId,
        'expenses',
        input.expenseId,
        `${randomUUID()}-optimized.webp`,
      ].join('/');
      await this.uploadBuffer(
        this.getExpenseFilesBucket(),
        storagePath,
        optimized.full.buffer,
        optimized.full.mimeType,
      );
      await this.storedFiles?.register({
        tenantId: input.tenantId,
        branchId: input.branchId,
        ownerProfileId: input.ownerProfileId,
        module: 'expenses',
        targetType: 'expense',
        targetId: input.expenseId,
        bucket: this.getExpenseFilesBucket(),
        storagePath,
        originalName,
        mimeType: optimized.full.mimeType,
        buffer: optimized.full.buffer,
        visibility: StoredFileVisibility.SIGNED_ONLY,
        scanStatus: StoredFileScanStatus.NOT_REQUIRED,
      });
      return {
        fileName: this.withWebpExtension(originalName),
        fileUrl: await this.createSignedUrl(
          this.getExpenseFilesBucket(),
          storagePath,
        ),
        storagePath,
        mimeType: optimized.full.mimeType,
        fileType,
        fileSize: optimized.full.size,
        originalSize: optimized.originalSize,
        width: optimized.full.width,
        height: optimized.full.height,
      };
    }

    this.assertFileSignature(input.file, fileType);
    const extension =
      extname(originalName) || this.extensionFromMime(input.file.mimetype);
    const storagePath = [
      input.tenantId,
      input.branchId,
      'expenses',
      input.expenseId,
      `${randomUUID()}${extension}`,
    ].join('/');

    const bucket = this.getExpenseFilesBucket();
    await this.uploadToBucket(bucket, storagePath, input.file);
    const scanStatus = this.scanner
      ? await this.scanner.classify({
          mimeType: input.file.mimetype!,
          buffer: input.file.buffer!,
          originalName,
        })
      : StoredFileScanStatus.PENDING;
    await this.storedFiles?.register({
      tenantId: input.tenantId,
      branchId: input.branchId,
      ownerProfileId: input.ownerProfileId,
      module: 'expenses',
      targetType: 'expense',
      targetId: input.expenseId,
      bucket,
      storagePath,
      originalName,
      mimeType: input.file.mimetype!,
      buffer: input.file.buffer!,
      visibility: StoredFileVisibility.SIGNED_ONLY,
      scanStatus,
    });

    return {
      fileName: originalName,
      fileUrl: await this.createSignedUrl(bucket, storagePath),
      storagePath,
      mimeType: input.file.mimetype || 'application/octet-stream',
      fileType,
      fileSize: input.file.size ?? input.file.buffer?.length ?? 0,
      originalSize: input.file.size ?? input.file.buffer?.length ?? 0,
      width: null,
      height: null,
    };
  }

  async getPetPhotoUrl(storagePath?: string | null) {
    if (!storagePath) {
      return null;
    }

    if (this.useSignedUrls) {
      await this.storedFiles?.assertDownloadable(storagePath);
      return this.createSignedUrl(this.petPhotosBucket, storagePath);
    }

    return this.supabase.admin.storage
      .from(this.petPhotosBucket)
      .getPublicUrl(storagePath).data.publicUrl;
  }

  async getProductImageUrl(storagePath?: string | null) {
    if (!storagePath) {
      return null;
    }

    if (this.useSignedUrls) {
      await this.storedFiles?.assertDownloadable(storagePath);
      return this.createSignedUrl(this.getProductImagesBucket(), storagePath);
    }

    return this.supabase.admin.storage
      .from(this.getProductImagesBucket())
      .getPublicUrl(storagePath).data.publicUrl;
  }

  async getProductImageUrls(storagePaths: Array<string | null | undefined>) {
    const paths = [
      ...new Set(storagePaths.filter((path): path is string => Boolean(path))),
    ];
    const urls = new Map<string, string>();
    if (!paths.length) return urls;

    const bucket = this.getProductImagesBucket();
    if (!this.useSignedUrls) {
      for (const path of paths) {
        urls.set(
          path,
          this.supabase.admin.storage.from(bucket).getPublicUrl(path).data
            .publicUrl,
        );
      }
      return urls;
    }

    await Promise.all(
      paths.map((path) => this.storedFiles?.assertDownloadable(path)),
    );

    const { data, error } = await this.supabase.admin.storage
      .from(bucket)
      .createSignedUrls(paths, this.signedUrlTtl());
    if (error) {
      throw new InternalServerErrorException(
        `Supabase Storage signed URLs failed: ${error.message}`,
      );
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
    await Promise.all(paths.map((path) => this.storedFiles?.touch(path)));
    return urls;
  }

  async getExpenseFileUrl(storagePath?: string | null) {
    if (!storagePath) {
      return null;
    }

    await this.storedFiles?.assertDownloadable(storagePath);
    return this.createSignedUrl(this.getExpenseFilesBucket(), storagePath);
  }

  async createSignedSaleDocumentUrl(storagePath?: string | null) {
    if (!storagePath) {
      return null;
    }

    await this.storedFiles?.assertDownloadable(storagePath);
    return this.createSignedUrl(this.getSaleDocumentsBucket(), storagePath);
  }

  async uploadFiscalXml(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    documentId: string;
    ownerProfileId?: string | null;
    content: Buffer;
  }) {
    const storagePath = [
      input.tenantId,
      input.branchId,
      'sales',
      input.saleId,
      'documents',
      input.documentId,
      'nfe55.xml',
    ].join('/');
    await this.uploadPrivateBuffer(
      this.getSaleDocumentsBucket(),
      storagePath,
      input.content,
      'application/xml',
    );
    await this.storedFiles?.register({
      tenantId: input.tenantId,
      branchId: input.branchId,
      ownerProfileId: input.ownerProfileId,
      module: 'fiscal',
      targetType: 'sale_document',
      targetId: input.documentId,
      bucket: this.getSaleDocumentsBucket(),
      storagePath,
      originalName: 'nfe55.xml',
      mimeType: 'application/xml',
      buffer: input.content,
      visibility: StoredFileVisibility.PRIVATE,
      scanStatus: StoredFileScanStatus.CLEAN,
    });
    return storagePath;
  }

  async uploadFiscalPdf(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    documentId: string;
    ownerProfileId?: string | null;
    content: Buffer;
  }) {
    const storagePath = [
      input.tenantId,
      input.branchId,
      'sales',
      input.saleId,
      'documents',
      input.documentId,
      'danfe.pdf',
    ].join('/');
    await this.uploadPrivateBuffer(
      this.getSaleDocumentsBucket(),
      storagePath,
      input.content,
      'application/pdf',
    );
    await this.storedFiles?.register({
      tenantId: input.tenantId,
      branchId: input.branchId,
      ownerProfileId: input.ownerProfileId,
      module: 'fiscal',
      targetType: 'sale_document',
      targetId: input.documentId,
      bucket: this.getSaleDocumentsBucket(),
      storagePath,
      originalName: 'danfe.pdf',
      mimeType: 'application/pdf',
      buffer: input.content,
      visibility: StoredFileVisibility.PRIVATE,
      scanStatus: StoredFileScanStatus.CLEAN,
    });
    return storagePath;
  }

  async removeFiscalFile(storagePath?: string | null) {
    await this.removeFromBucket(this.getSaleDocumentsBucket(), storagePath);
    await this.storedFiles?.markDeleted([storagePath]);
  }

  async removePetPhoto(storagePath?: string | null) {
    if (!storagePath) {
      return;
    }

    await this.removeFromBucket(this.petPhotosBucket, storagePath);
  }

  async removePetPhotoVariants(
    storagePath?: string | null,
    mediumPath?: string | null,
    thumbnailPath?: string | null,
  ) {
    await this.removeManyFromBucket(this.petPhotosBucket, [
      storagePath,
      mediumPath,
      thumbnailPath,
    ]);
    await this.storedFiles?.markDeleted([
      storagePath,
      mediumPath,
      thumbnailPath,
    ]);
  }

  async removeProductImage(
    storagePath?: string | null,
    mediumPath?: string | null,
    thumbnailPath?: string | null,
  ) {
    await this.removeManyFromBucket(this.getProductImagesBucket(), [
      storagePath,
      mediumPath,
      thumbnailPath,
    ]);
    await this.storedFiles?.markDeleted([
      storagePath,
      mediumPath,
      thumbnailPath,
    ]);
  }

  async removeExpenseFile(storagePath?: string | null) {
    await this.removeFromBucket(this.getExpenseFilesBucket(), storagePath);
    await this.storedFiles?.markDeleted([storagePath]);
  }

  private getProductImagesBucket() {
    return (
      process.env.SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES || 'product-images'
    );
  }

  private getExpenseFilesBucket() {
    return process.env.SUPABASE_STORAGE_BUCKET_EXPENSE_FILES || 'expense-files';
  }

  private getSaleDocumentsBucket() {
    return (
      process.env.SUPABASE_STORAGE_BUCKET_SALE_DOCUMENTS || 'sale-documents'
    );
  }

  private async uploadToBucket(
    bucket: string,
    storagePath: string,
    file: UploadFile,
  ) {
    const { error } = await this.supabase.admin.storage
      .from(bucket)
      .upload(storagePath, file.buffer!, {
        contentType: file.mimetype,
        cacheControl: '31536000',
        upsert: false,
      });

    if (error) {
      if (this.isBucketNotFoundError(error)) {
        this.logger.error(
          `Supabase Storage bucket not found: ${bucket}. Configure the bucket in Supabase Storage and set the matching SUPABASE_STORAGE_BUCKET_* env.`,
        );
        throw new ServiceUnavailableException(
          `Supabase Storage bucket "${bucket}" was not found. Create it in Supabase Storage or configure the correct bucket env before uploading images.`,
        );
      }

      throw new InternalServerErrorException(
        `Supabase Storage upload failed: ${error.message}`,
      );
    }

    return this.useSignedUrls
      ? this.createSignedUrl(bucket, storagePath)
      : this.supabase.admin.storage.from(bucket).getPublicUrl(storagePath).data
          .publicUrl;
  }

  private async uploadBuffer(
    bucket: string,
    storagePath: string,
    buffer: Buffer,
    contentType: string,
  ) {
    return this.uploadToBucket(bucket, storagePath, {
      buffer,
      size: buffer.length,
      mimetype: contentType,
    });
  }

  private async uploadImageVariants(
    bucket: string,
    basePath: string,
    optimized: OptimizedImage,
    input: {
      fileName: string;
      tenantId: string;
      branchId: string;
      ownerProfileId?: string | null;
      module: string;
      targetType: string;
      targetId: string;
    },
  ) {
    const paths = {
      storagePath: `${basePath}-optimized.webp`,
      mediumPath: `${basePath}-medium.webp`,
      thumbnailPath: `${basePath}-thumb.webp`,
    };
    const uploadedPaths: string[] = [];

    try {
      const fileUrl = await this.uploadBuffer(
        bucket,
        paths.storagePath,
        optimized.full.buffer,
        optimized.full.mimeType,
      );
      uploadedPaths.push(paths.storagePath);
      const mediumUrl = await this.uploadBuffer(
        bucket,
        paths.mediumPath,
        optimized.medium.buffer,
        optimized.medium.mimeType,
      );
      uploadedPaths.push(paths.mediumPath);
      const thumbnailUrl = await this.uploadBuffer(
        bucket,
        paths.thumbnailPath,
        optimized.thumbnail.buffer,
        optimized.thumbnail.mimeType,
      );
      uploadedPaths.push(paths.thumbnailPath);
      await Promise.all([
        this.registerImageVariant(
          input,
          bucket,
          paths.storagePath,
          optimized.full.buffer,
        ),
        this.registerImageVariant(
          input,
          bucket,
          paths.mediumPath,
          optimized.medium.buffer,
        ),
        this.registerImageVariant(
          input,
          bucket,
          paths.thumbnailPath,
          optimized.thumbnail.buffer,
        ),
      ]);

      return {
        fileName: this.withWebpExtension(input.fileName),
        fileUrl,
        storagePath: paths.storagePath,
        mediumUrl,
        mediumPath: paths.mediumPath,
        thumbnailUrl,
        thumbnailPath: paths.thumbnailPath,
        mimeType: optimized.full.mimeType,
        size: optimized.full.size,
        originalSize: optimized.originalSize,
        width: optimized.full.width,
        height: optimized.full.height,
        thumbnailSize: optimized.thumbnail.size,
      };
    } catch (error) {
      await this.removeManyFromBucket(bucket, uploadedPaths);
      await this.storedFiles?.markDeleted(uploadedPaths);
      throw error;
    }
  }

  private async uploadPrivateBuffer(
    bucket: string,
    storagePath: string,
    content: Buffer,
    contentType: string,
  ) {
    const { error } = await this.supabase.admin.storage
      .from(bucket)
      .upload(storagePath, content, {
        contentType,
        upsert: false,
      });

    if (error) {
      if (this.isBucketNotFoundError(error)) {
        throw new ServiceUnavailableException(
          `Supabase Storage bucket "${bucket}" was not found. Fiscal documents require this private bucket.`,
        );
      }
      throw new InternalServerErrorException(
        `Supabase Storage fiscal upload failed: ${error.message}`,
      );
    }
  }

  private async removeFromBucket(bucket: string, storagePath?: string | null) {
    if (!storagePath) {
      return;
    }

    await this.supabase.admin.storage
      .from(bucket)
      .remove([storagePath])
      .catch(() => undefined);
  }

  private async removeManyFromBucket(
    bucket: string,
    paths: Array<string | null | undefined>,
  ) {
    const uniquePaths = [
      ...new Set(paths.filter((path): path is string => Boolean(path))),
    ];
    if (!uniquePaths.length) return;
    await this.supabase.admin.storage
      .from(bucket)
      .remove(uniquePaths)
      .catch(() => undefined);
  }

  private assertImage(file: UploadFile, maxSizeBytes: number) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo de imagem foi enviado.');
    }

    if (!file.mimetype || !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Formato invalido. Use imagens JPEG, PNG ou WEBP.',
      );
    }

    if ((file.size ?? file.buffer.length) > maxSizeBytes) {
      throw new BadRequestException(
        `Imagem excede o limite de ${Math.round(maxSizeBytes / 1024 / 1024)}MB.`,
      );
    }
  }

  private assertExpenseFile(file: UploadFile, maxSizeBytes: number) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo de despesa foi enviado.');
    }

    const fileType = file.mimetype
      ? ALLOWED_EXPENSE_TYPES.get(file.mimetype)
      : undefined;
    if (!fileType) {
      throw new BadRequestException(
        'Formato invalido. Use imagem JPEG, PNG, WEBP, GIF, PDF, DOC ou DOCX.',
      );
    }

    if ((file.size ?? file.buffer.length) > maxSizeBytes) {
      throw new BadRequestException(
        `Arquivo excede o limite de ${Math.round(maxSizeBytes / 1024 / 1024)}MB.`,
      );
    }

    return fileType;
  }

  private assertFileSignature(file: UploadFile, fileType: ExpenseFileType) {
    const buffer = file.buffer!;
    const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    const isLegacyDoc =
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    const isZip =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(buffer[2]) &&
      [0x04, 0x06, 0x08].includes(buffer[3]);
    const isDocxMime =
      file.mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const zipText = isZip ? buffer.toString('latin1') : '';
    const hasDocxStructure =
      isZip &&
      zipText.includes('[Content_Types].xml') &&
      zipText.includes('word/');

    const valid =
      (fileType === ExpenseFileType.pdf && isPdf) ||
      (fileType === ExpenseFileType.word &&
        (isLegacyDoc || (isDocxMime && hasDocxStructure)));
    if (!valid) {
      throw new BadRequestException(
        'O conteudo do arquivo nao corresponde ao formato PDF, DOC ou DOCX informado.',
      );
    }
  }

  private cleanFileName(value: string) {
    const cleaned = value
      .trim()
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 160);

    return cleaned || 'pet-photo';
  }

  private extensionFromMime(mime?: string) {
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/gif') return '.gif';
    if (mime === 'application/pdf') return '.pdf';
    if (mime === 'application/msword') return '.doc';
    if (
      mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
      return '.docx';
    return '.jpg';
  }

  private withWebpExtension(fileName: string) {
    return `${fileName.replace(/\.[^.]+$/, '') || 'image'}.webp`;
  }

  private isBucketNotFoundError(error: {
    message?: string;
    statusCode?: string | number;
    status?: string | number;
  }) {
    const message = error.message?.toLowerCase() ?? '';
    return (
      message.includes('bucket not found') ||
      (message.includes('bucket') && message.includes('not found')) ||
      error.statusCode === '404' ||
      error.statusCode === 404 ||
      error.status === '404' ||
      error.status === 404
    );
  }

  private async createSignedUrl(bucket: string, storagePath: string) {
    const ttl = this.signedUrlTtl();
    const { data, error } = await this.supabase.admin.storage
      .from(bucket)
      .createSignedUrl(storagePath, ttl);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException(
        `Supabase Storage signed URL failed: ${error?.message || 'missing signed URL'}`,
      );
    }
    await this.storedFiles?.touch(storagePath);

    return data.signedUrl;
  }

  private signedUrlTtl() {
    const configured = Number(process.env.UPLOAD_SIGNED_URL_TTL_SECONDS || 600);
    return Number.isFinite(configured)
      ? Math.min(3600, Math.max(60, Math.round(configured)))
      : 600;
  }

  private registerImageVariant(
    input: {
      tenantId: string;
      branchId: string;
      ownerProfileId?: string | null;
      module: string;
      targetType: string;
      targetId: string;
      fileName: string;
    },
    bucket: string,
    storagePath: string,
    buffer: Buffer,
  ) {
    return this.storedFiles?.register({
      tenantId: input.tenantId,
      branchId: input.branchId,
      ownerProfileId: input.ownerProfileId,
      module: input.module,
      targetType: input.targetType,
      targetId: input.targetId,
      bucket,
      storagePath,
      originalName: input.fileName,
      mimeType: 'image/webp',
      buffer,
      visibility: this.useSignedUrls
        ? StoredFileVisibility.SIGNED_ONLY
        : StoredFileVisibility.PUBLIC,
      scanStatus: StoredFileScanStatus.NOT_REQUIRED,
    });
  }
}
