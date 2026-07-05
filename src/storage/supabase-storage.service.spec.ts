import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseStorageService } from './supabase-storage.service';

describe('SupabaseStorageService', () => {
  const previousProductBucket =
    process.env.SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES;
  const previousSignedUrls = process.env.SUPABASE_STORAGE_SIGNED_URLS;

  afterEach(() => {
    if (previousProductBucket === undefined) {
      delete process.env.SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES;
    } else {
      process.env.SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES =
        previousProductBucket;
    }

    if (previousSignedUrls === undefined) {
      delete process.env.SUPABASE_STORAGE_SIGNED_URLS;
    } else {
      process.env.SUPABASE_STORAGE_SIGNED_URLS = previousSignedUrls;
    }
    jest.restoreAllMocks();
  });

  function makeSupabase(error?: {
    message?: string;
    statusCode?: string | number;
  }) {
    const upload = jest.fn().mockResolvedValue({ error: error ?? null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({
      data: { publicUrl: 'https://storage.test/product.jpg' },
    });

    return {
      admin: {
        storage: {
          from: jest.fn().mockReturnValue({
            upload,
            getPublicUrl,
            remove,
          }),
        },
      },
      upload,
      getPublicUrl,
    };
  }

  const optimizer = {
    optimize: jest.fn().mockResolvedValue({
      originalSize: 10,
      full: {
        buffer: Buffer.from('full'),
        width: 1200,
        height: 800,
        size: 4,
        mimeType: 'image/webp',
      },
      medium: {
        buffer: Buffer.from('medium'),
        width: 960,
        height: 640,
        size: 6,
        mimeType: 'image/webp',
      },
      thumbnail: {
        buffer: Buffer.from('thumb'),
        width: 320,
        height: 213,
        size: 5,
        mimeType: 'image/webp',
      },
    }),
  };

  it('usa SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES para imagens de produto', async () => {
    process.env.SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES = 'catalog-images';
    process.env.SUPABASE_STORAGE_SIGNED_URLS = 'false';
    const supabase = makeSupabase();
    const service = new SupabaseStorageService(
      supabase as any,
      optimizer as any,
    );

    await expect(
      service.uploadProductImage({
        tenantId: 'tenant-id',
        branchId: 'branch-id',
        productId: 'product-id',
        file: {
          originalname: 'produto.jpg',
          mimetype: 'image/jpeg',
          size: 10,
          buffer: Buffer.from('ok'),
        },
      }),
    ).resolves.toMatchObject({
      fileName: 'produto.webp',
      fileUrl: 'https://storage.test/product.jpg',
      storagePath: expect.stringContaining(
        'tenant-id/branch-id/products/product-id/',
      ),
    });

    expect(supabase.admin.storage.from).toHaveBeenCalledWith('catalog-images');
  });

  it('usa product-images como fallback exato quando a env de bucket nao existe', async () => {
    delete process.env.SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES;
    process.env.SUPABASE_STORAGE_SIGNED_URLS = 'false';
    const supabase = makeSupabase();
    const service = new SupabaseStorageService(
      supabase as any,
      optimizer as any,
    );

    await service.uploadProductImage({
      tenantId: 'tenant-id',
      branchId: 'branch-id',
      productId: 'product-id',
      file: {
        originalname: 'produto.jpg',
        mimetype: 'image/jpeg',
        size: 10,
        buffer: Buffer.from('ok'),
      },
    });

    expect(supabase.admin.storage.from).toHaveBeenCalledWith('product-images');
  });

  it('retorna 503 claro quando o bucket de produto nao existe', async () => {
    process.env.SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES = 'product-images';
    const supabase = makeSupabase({
      message: 'Bucket not found',
      statusCode: '404',
    });
    const service = new SupabaseStorageService(
      supabase as any,
      optimizer as any,
    );

    await expect(
      service.uploadProductImage({
        tenantId: 'tenant-id',
        branchId: 'branch-id',
        productId: 'product-id',
        file: {
          originalname: 'produto.jpg',
          mimetype: 'image/jpeg',
          size: 10,
          buffer: Buffer.from('ok'),
        },
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('bloqueia antes do Storage quando a quota e excedida', async () => {
    const supabase = makeSupabase();
    const quotas = {
      assertAllowed: jest
        .fn()
        .mockRejectedValue(new BadRequestException('quota exceeded')),
    };
    const service = new SupabaseStorageService(
      supabase as any,
      optimizer as any,
      undefined,
      quotas as any,
    );

    await expect(
      service.uploadProductImage({
        tenantId: 'tenant-id',
        branchId: 'branch-id',
        productId: 'product-id',
        ownerProfileId: 'profile-id',
        file: {
          originalname: 'produto.jpg',
          mimetype: 'image/jpeg',
          size: 10,
          buffer: Buffer.from('ok'),
        },
      }),
    ).rejects.toThrow('quota exceeded');
    expect(supabase.admin.storage.from).not.toHaveBeenCalled();
  });
});
