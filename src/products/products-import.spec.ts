import { Role } from '@prisma/client';
import { ProductsService } from './products.service';

const { convert } = require('../../public/Js/product-import-data.js') as {
  convert(raw: Record<string, unknown>): Record<string, unknown>;
};

describe('product import', () => {
  const product = {
    name: 'Produto',
    barcode: '000123',
    costPriceCents: 125050,
    salePriceCents: 150060,
    quantity: 0,
  };

  it('keeps barcode zeros and converts Brazilian prices and percentages', () => {
    expect(
      convert({
        name: ' Produto ',
        barcode: '000123',
        cost: 'R$ 1.250,50',
        percent: '20%',
      }),
    ).toEqual(product);
    expect(
      convert({ name: 'Produto', cost: '10.5', profit: '1,25', sale: '12,00' }),
    ).toMatchObject({
      barcode: null,
      costPriceCents: 1050,
      salePriceCents: 1200,
    });
    expect(() =>
      convert({ name: 'Produto', cost: '10xyz', sale: '20' }),
    ).toThrow('Custo inválido');
  });

  it('scopes the import to the confirmed branch and replays rows without barcodes', async () => {
    let saved: any;
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      product: { createMany },
      administrativeOperationExecution: {
        findUnique: jest.fn(async () => saved),
        create: jest.fn(async ({ data }) => {
          saved = data;
        }),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) };
    const context = {
      resolve: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant-a', branchId: 'branch-a' }),
    };
    const service = new ProductsService(
      prisma as any,
      undefined,
      context as any,
    );
    const items = [{ ...product, barcode: ' ' }];
    const user = { id: 'operator', role: Role.Admin } as any;
    const run = () =>
      service.importBatch(user, { items }, 'batch-0001', 'branch-a');
    await expect(run()).resolves.toEqual({
      replayed: false,
      result: { received: 1, imported: 1, duplicates: 0 },
    });
    await expect(run()).resolves.toMatchObject({ replayed: true });
    expect(context.resolve).toHaveBeenCalledWith(user, {
      requireBranch: true,
      writable: true,
      selectedBranchId: 'branch-a',
      allowedRoles: [Role.Admin],
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: 'tenant-a',
          branchId: 'branch-a',
          barcode: null,
        }),
      ],
      skipDuplicates: true,
    });
    expect(saved.tenantScope).toBe('tenant-a:branch-a');
    context.resolve.mockResolvedValueOnce({
      tenantId: 'tenant-a',
      branchId: 'branch-b',
    });
    await expect(run()).rejects.toThrow(
      'A filial de destino não está disponível.',
    );
    expect(createMany).toHaveBeenCalledTimes(1);
  });
});
