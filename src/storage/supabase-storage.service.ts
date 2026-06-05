import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
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
  private readonly bucket =
    process.env.SUPABASE_STORAGE_BUCKET_PET_PHOTOS || 'pet-photos';
  private readonly maxSizeBytes =
    Number(process.env.PET_PHOTO_MAX_SIZE_MB || 5) * 1024 * 1024;
  private readonly useSignedUrls =
    process.env.SUPABASE_STORAGE_SIGNED_URLS === 'true';

  constructor(private readonly supabase: SupabaseService) {}

  async uploadPetPhoto(input: {
    tenantId: string;
    branchId: string;
    petId: string;
    file: UploadFile;
  }) {
    this.assertImage(input.file);

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

    const { error } = await this.supabase.admin.storage
      .from(this.bucket)
      .upload(storagePath, input.file.buffer!, {
        contentType: input.file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Supabase Storage upload failed: ${error.message}`,
      );
    }

    const fileUrl = this.useSignedUrls
      ? await this.createSignedUrl(storagePath)
      : this.supabase.admin.storage.from(this.bucket).getPublicUrl(storagePath)
          .data.publicUrl;

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
      return this.createSignedUrl(storagePath);
    }

    return this.supabase.admin.storage.from(this.bucket).getPublicUrl(storagePath)
      .data.publicUrl;
  }

  async removePetPhoto(storagePath?: string | null) {
    if (!storagePath) {
      return;
    }

    await this.supabase.admin.storage
      .from(this.bucket)
      .remove([storagePath])
      .catch(() => undefined);
  }

  private assertImage(file: UploadFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo de imagem foi enviado.');
    }

    if (!file.mimetype || !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Formato invalido. Use imagens JPEG, PNG ou WEBP.',
      );
    }

    if ((file.size ?? file.buffer.length) > this.maxSizeBytes) {
      throw new BadRequestException(
        `Imagem excede o limite de ${process.env.PET_PHOTO_MAX_SIZE_MB || 5}MB.`,
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

  private async createSignedUrl(storagePath: string) {
    const { data, error } = await this.supabase.admin.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, 60 * 60);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException(
        `Supabase Storage signed URL failed: ${error?.message || 'missing signed URL'}`,
      );
    }

    return data.signedUrl;
  }
}
