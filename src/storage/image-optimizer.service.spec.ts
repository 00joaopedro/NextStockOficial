import { BadRequestException } from '@nestjs/common';
import type sharpFactory from 'sharp';

const sharp: typeof sharpFactory = require('sharp');
import { ImageOptimizerService } from './image-optimizer.service';

describe('ImageOptimizerService', () => {
  const service = new ImageOptimizerService();

  it('gera variantes WebP menores sem ampliar a imagem', async () => {
    const input = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: '#336699',
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const result = await service.optimize({
      originalname: 'produto.jpg',
      mimetype: 'image/jpeg',
      size: input.length,
      buffer: input,
    });

    expect(result.originalSize).toBe(input.length);
    expect(result.full.mimeType).toBe('image/webp');
    expect(result.full.width).toBe(640);
    expect(result.medium.width).toBe(640);
    expect(result.thumbnail.width).toBe(320);
    await expect(sharp(result.thumbnail.buffer).metadata()).resolves.toMatchObject({
      format: 'webp',
      width: 320,
      height: 240,
    });
  });

  it('rejeita conteudo que apenas declara MIME de imagem', async () => {
    await expect(
      service.optimize({
        originalname: 'falso.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('nao e uma imagem'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
