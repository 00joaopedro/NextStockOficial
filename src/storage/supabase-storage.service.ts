import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { SupabaseService } from '../supabase/supabase.service';

type UploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly petPhotosBucket =
    process.env.SUPABASE_STORAGE_BUCKET_PET_PHOTOS || 'pet-photos';
  private readonly productImagesBucket =
    process.env.SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES || 'product-images';
  private readonly petPhotoMaxSizeBytes =
    Number(process.env.PET_PHOTO_MAX_SIZE_MB || 5) * 1024 * 1024;
  private readonly productImageMaxSizeBytes =
    Number(process.env.PRODUCT_IMAGE_MAX_SIZE_MB || 5) * 1024 * 1024;
  private readonly useSignedUrls =
    process.env.SUPABASE_STORAGE_SIGNED_URLS === 'true';

  constructor(private readonly supabase: SupabaseService) {}

  async uploadPetPhoto(input: {
    tenantId: string;
    branchId: string;
    petId: string;
    file: UploadFile;
  }) {
    this.assertImage(input.file, this.petPhotoMaxSizeBytes);

    const originalName = this.cleanFileName(
      input.file.originalname || 'pet-photo',
    );
    const extension = extname(originalName) || this.extensionFromMime(input.file.mimetype);
    const storagePath = [
      input.tenantId,
      input.branchId,
      input.petId,
      `${randomUUID()}${extension}`,
    ].join('/');

    const fileUrl = await this.uploadToBucket(
      this.petPhotosBucket,
      storagePath,
      input.file,
    );

    return {
      fileName: originalName,
      fileUrl,
      storagePath,
    };
  }

  async uploadProductImage(input: {
    tenantId: string;
    branchId: string;
    productId: string;
    file: UploadFile;
  }) {
    this.assertImage(input.file, this.productImageMaxSizeBytes);

    const originalName = this.cleanFileName(
      input.file.originalname || 'product-image',
    );
    const extension = extname(originalName) || this.extensionFromMime(input.file.mimetype);
    const storagePath = [
      input.tenantId,
      input.branchId,
      'products',
      input.productId,
      `${randomUUID()}${extension}`,
    ].join('/');

    const fileUrl = await this.uploadToBucket(
      this.productImagesBucket,
      storagePath,
      input.file,
    );

    return {
      fileName: originalName,
      fileUrl,
      storagePath,
    };
  }

  async getPetPhotoUrl(storagePath?: string | null) {
    if (!storagePath) {
      return null;
    }

    if (this.useSignedUrls) {
      return this.createSignedUrl(this.petPhotosBucket, storagePath);
    }

    return this.supabase.admin.storage.from(this.petPhotosBucket).getPublicUrl(storagePath)
      .data.publicUrl;
  }

  async getProductImageUrl(storagePath?: string | null) {
    if (!storagePath) {
      return null;
    }

    if (this.useSignedUrls) {
      return this.createSignedUrl(this.productImagesBucket, storagePath);
    }

    return this.supabase.admin.storage
      .from(this.productImagesBucket)
      .getPublicUrl(storagePath).data.publicUrl;
  }

  async removePetPhoto(storagePath?: string | null) {
    if (!storagePath) {
      return;
    }

    await this.removeFromBucket(this.petPhotosBucket, storagePath);
  }

  async removeProductImage(storagePath?: string | null) {
    await this.removeFromBucket(this.productImagesBucket, storagePath);
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
      : this.supabase.admin.storage.from(bucket).getPublicUrl(storagePath)
          .data.publicUrl;
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
    return '.jpg';
  }

  private isBucketNotFoundError(error: { message?: string; statusCode?: string | number; status?: string | number }) {
    const message = error.message?.toLowerCase() ?? '';
    return (
      message.includes('bucket not found') ||
      message.includes('bucket') && message.includes('not found') ||
      error.statusCode === '404' ||
      error.statusCode === 404 ||
      error.status === '404' ||
      error.status === 404
    );
  }

  private async createSignedUrl(bucket: string, storagePath: string) {
    const { data, error } = await this.supabase.admin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 60);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException(
        `Supabase Storage signed URL failed: ${error?.message || 'missing signed URL'}`,
      );
    }

    return data.signedUrl;
  }
}
