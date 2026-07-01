import { BadRequestException, Injectable } from '@nestjs/common';
import type sharpFactory from 'sharp';
import type { Sharp } from 'sharp';

const sharp: typeof sharpFactory = require('sharp');

export type UploadImageFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type OptimizedImageVariant = {
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
  mimeType: 'image/webp';
};

export type OptimizedImage = {
  originalSize: number;
  full: OptimizedImageVariant;
  medium: OptimizedImageVariant;
  thumbnail: OptimizedImageVariant;
};

const MAX_INPUT_PIXELS = 40_000_000;

@Injectable()
export class ImageOptimizerService {
  async optimize(file: UploadImageFile): Promise<OptimizedImage> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo de imagem foi enviado.');
    }

    try {
      const source = sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: this.envInt('IMAGE_MAX_INPUT_PIXELS', MAX_INPUT_PIXELS),
        sequentialRead: true,
      }).rotate();
      const metadata = await source.metadata();

      if (!metadata.width || !metadata.height || !metadata.format) {
        throw new Error('missing image metadata');
      }
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
        throw new Error(`unsupported image format: ${metadata.format}`);
      }

      const [full, medium, thumbnail] = await Promise.all([
        this.variant(source, this.envInt('IMAGE_FULL_MAX_PX', 1920), this.envInt('IMAGE_FULL_WEBP_QUALITY', 80)),
        this.variant(source, this.envInt('IMAGE_MEDIUM_MAX_PX', 960), this.envInt('IMAGE_MEDIUM_WEBP_QUALITY', 76)),
        this.variant(source, this.envInt('IMAGE_THUMBNAIL_MAX_PX', 320), this.envInt('IMAGE_THUMBNAIL_WEBP_QUALITY', 70)),
      ]);
      const maxOutputBytes =
        this.envInt('IMAGE_MAX_OPTIMIZED_SIZE_MB', 3) * 1024 * 1024;
      if (full.size > maxOutputBytes) {
        throw new BadRequestException(
          `Imagem otimizada excede o limite de ${Math.round(maxOutputBytes / 1024 / 1024)}MB.`,
        );
      }

      return {
        originalSize: file.size ?? file.buffer.length,
        full,
        medium,
        thumbnail,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Imagem invalida, corrompida, perigosa ou em formato nao suportado.',
      );
    }
  }

  private async variant(
    source: Sharp,
    maxPixels: number,
    quality: number,
  ): Promise<OptimizedImageVariant> {
    const { data, info } = await source
      .clone()
      .resize({
        width: maxPixels,
        height: maxPixels,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: Math.min(100, Math.max(1, quality)),
        effort: 5,
        smartSubsample: true,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      width: info.width,
      height: info.height,
      size: data.length,
      mimeType: 'image/webp',
    };
  }

  private envInt(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}
