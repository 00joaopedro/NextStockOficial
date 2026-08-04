import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
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

const MAX_INPUT_PIXELS = 20_000_000;

@Injectable()
export class ImageOptimizerService {
  async optimize(file: UploadImageFile): Promise<OptimizedImage> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo de imagem foi enviado.');
    }

    const pixelLimit = this.envInt('IMAGE_MAX_INPUT_PIXELS', MAX_INPUT_PIXELS);
    const timeoutMs = this.envInt('IMAGE_PROCESSING_TIMEOUT_MS', 30_000);
    const deadline = Date.now() + timeoutMs;
    let metadataSource: Sharp | undefined;
    try {
      metadataSource = sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: pixelLimit,
        sequentialRead: true,
        pages: 1,
      }).timeout({ seconds: this.remainingSeconds(deadline) });
      const metadata = await metadataSource.metadata();

      if (!metadata.width || !metadata.height || !metadata.format) {
        throw new Error('missing image metadata');
      }
      if (
        !Number.isSafeInteger(metadata.width) ||
        !Number.isSafeInteger(metadata.height) ||
        metadata.width <= 0 ||
        metadata.height <= 0 ||
        metadata.width > Math.floor(pixelLimit / metadata.height)
      ) {
        throw new PayloadTooLargeException(
          `A imagem excede o limite de ${pixelLimit} pixels.`,
        );
      }
      if ((metadata.pages ?? 1) !== 1) {
        throw new BadRequestException(
          'Imagens animadas ou com multiplas paginas nao sao aceitas.',
        );
      }
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
        throw new Error(`unsupported image format: ${metadata.format}`);
      }

      metadataSource.destroy();
      metadataSource = undefined;
      // Variants are intentionally sequential: only one libvips decode/encode
      // pipeline and one new output Buffer exist at a time.
      const full = await this.variant(
        file.buffer,
        this.envInt('IMAGE_FULL_MAX_PX', 1920),
        this.envInt('IMAGE_FULL_WEBP_QUALITY', 80),
        pixelLimit,
        deadline,
      );
      const medium = await this.variant(
        file.buffer,
        this.envInt('IMAGE_MEDIUM_MAX_PX', 960),
        this.envInt('IMAGE_MEDIUM_WEBP_QUALITY', 76),
        pixelLimit,
        deadline,
      );
      const thumbnail = await this.variant(
        file.buffer,
        this.envInt('IMAGE_THUMBNAIL_MAX_PX', 320),
        this.envInt('IMAGE_THUMBNAIL_WEBP_QUALITY', 70),
        pixelLimit,
        deadline,
      );
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
      if (
        error instanceof BadRequestException ||
        error instanceof PayloadTooLargeException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      if (error instanceof Error && /pixel limit/i.test(error.message)) {
        throw new PayloadTooLargeException(
          `A imagem excede o limite de ${pixelLimit} pixels.`,
        );
      }
      if (this.isTimeout(error)) {
        throw new ServiceUnavailableException(
          'O processamento da imagem excedeu o tempo limite. Tente novamente.',
        );
      }
      throw new BadRequestException(
        'Imagem invalida, corrompida, perigosa ou em formato nao suportado.',
      );
    } finally {
      metadataSource?.destroy();
    }
  }

  private async variant(
    input: Buffer,
    maxPixels: number,
    quality: number,
    pixelLimit: number,
    deadline: number,
  ): Promise<OptimizedImageVariant> {
    const pipeline = sharp(input, {
      failOn: 'warning',
      limitInputPixels: pixelLimit,
      sequentialRead: true,
      pages: 1,
    })
      .timeout({ seconds: this.remainingSeconds(deadline) })
      .rotate()
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
      });
    try {
      const { data, info } = await pipeline.toBuffer({
        resolveWithObject: true,
      });

      return {
        buffer: data,
        width: info.width,
        height: info.height,
        size: data.length,
        mimeType: 'image/webp',
      };
    } finally {
      pipeline.destroy();
    }
  }

  private remainingSeconds(deadline: number) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new ServiceUnavailableException(
        'O processamento da imagem excedeu o tempo limite. Tente novamente.',
      );
    return Math.max(1, Math.ceil(remaining / 1000));
  }

  private isTimeout(error: unknown) {
    return error instanceof Error && /timeout/i.test(error.message);
  }

  private envInt(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}
