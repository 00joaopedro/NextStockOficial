import 'dotenv/config';
import {
  MachineStatus,
  PaymentGatewayProvider,
  PaymentProvider,
  PlanInterval,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const gatewayMode = process.env.MERCADO_PAGO_MODE || 'production';
  const plans = [
    {
      name: 'Ouro',
      slug: 'ouro',
      priceCents: 20000,
      description:
        'Plano ideal para operacoes essenciais com praticidade no dia a dia.',
      sortOrder: 1,
      gatewayPlanId: process.env.MERCADO_PAGO_PLAN_ID_OURO || null,
    },
    {
      name: 'Esmeralda',
      slug: 'esmeralda',
      priceCents: 40000,
      description:
        'Mais recursos para gestao e crescimento, indicado para negocios em expansao.',
      sortOrder: 2,
      gatewayPlanId: process.env.MERCADO_PAGO_PLAN_ID_ESMERALDA || null,
    },
    {
      name: 'Diamante',
      slug: 'diamante',
      priceCents: 60000,
      description:
        'Plano completo para maxima performance, controle e escalabilidade.',
      sortOrder: 3,
      gatewayPlanId: process.env.MERCADO_PAGO_PLAN_ID_DIAMANTE || null,
    },
  ];

  for (const plan of plans) {
    const savedPlan = await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        priceCents: plan.priceCents,
        description: plan.description,
        currency: 'BRL',
        interval: PlanInterval.MONTHLY,
        intervalCount: 1,
        sortOrder: plan.sortOrder,
        isActive: true,
        deletedAt: null,
      },
      create: {
        name: plan.name,
        slug: plan.slug,
        priceCents: plan.priceCents,
        description: plan.description,
        currency: 'BRL',
        interval: PlanInterval.MONTHLY,
        intervalCount: 1,
        sortOrder: plan.sortOrder,
        isActive: true,
      },
    });

    await prisma.gatewayPlanMapping.upsert({
      where: {
        planId_provider_mode: {
          planId: savedPlan.id,
          provider: PaymentGatewayProvider.MERCADO_PAGO,
          mode: gatewayMode,
        },
      },
      update: {
        gatewayPlanId: plan.gatewayPlanId,
        paymentLinkUrl: null,
        isActive: Boolean(plan.gatewayPlanId),
        metadata: {
          correlationMode: 'recurring_preapproval',
        },
      },
      create: {
        planId: savedPlan.id,
        provider: PaymentGatewayProvider.MERCADO_PAGO,
        mode: gatewayMode,
        gatewayPlanId: plan.gatewayPlanId,
        paymentLinkUrl: null,
        isActive: Boolean(plan.gatewayPlanId),
        metadata: {
          correlationMode: 'recurring_preapproval',
        },
      },
    });
  }

  const demoTenantId = process.env.NEXTSTOCK_DEMO_TENANT_ID;
  const demoBranchId = process.env.NEXTSTOCK_DEMO_BRANCH_ID;

  if (process.env.NODE_ENV === 'development' && demoTenantId && demoBranchId) {
    const demoMachines = [
      {
        name: 'Stone - Caixa Principal',
        provider: PaymentProvider.stone,
        model: 'S920',
        feePercent: '2.99',
        status: MachineStatus.ativa,
      },
      {
        name: 'PagSeguro - Banho e Tosa',
        provider: PaymentProvider.pagseguro,
        model: 'Moderninha Pro',
        feePercent: '3.19',
        status: MachineStatus.ativa,
      },
      {
        name: 'Mercado Pago - Recepcao',
        provider: PaymentProvider.mercado_pago,
        model: 'Point Smart',
        feePercent: '3.49',
        status: MachineStatus.inativa,
        externalProvider: 'mercado_pago',
      },
    ];

    for (const machine of demoMachines) {
      await prisma.paymentMachine.create({
        data: {
          tenantId: demoTenantId,
          branchId: demoBranchId,
          ...machine,
        },
      });
    }

    const demoProducts = [
      {
        name: 'Camisa Polo Azul',
        costPriceCents: 4500,
        profitPercent: '30',
        salePriceCents: 5850,
        quantity: 10,
        brand: 'NextWear',
        category: 'Roupas',
        supplier: 'Fornecedor Azul',
        sku: 'CAM-001',
        barcode: '7891111111111',
        description: 'Camisa polo masculina azul',
        weight: '300 g',
        height: '5 cm',
        width: '20 cm',
        clothingSize: 'M',
        apparelSize: '40',
        images: ['camisa-polo-azul.jpg', 'camisa-polo-detalhe.jpg'],
      },
      {
        name: 'Tenis Esportivo Preto',
        costPriceCents: 12000,
        profitPercent: '25',
        salePriceCents: 15000,
        quantity: 6,
        brand: 'MoveFit',
        category: 'Calcados',
        supplier: 'Fornecedor Running',
        sku: 'TEN-010',
        barcode: '7892222222222',
        description: 'Tenis esportivo leve',
        weight: '800 g',
        height: '14 cm',
        width: '28 cm',
        clothingSize: 'GG',
        apparelSize: '42',
        images: ['tenis-preto.jpg'],
      },
    ];

    for (const product of demoProducts) {
      const { images, ...productData } = product;
      const savedProduct = await prisma.product.upsert({
        where: {
          tenantId_branchId_sku: {
            tenantId: demoTenantId,
            branchId: demoBranchId,
            sku: product.sku,
          },
        },
        update: productData,
        create: {
          tenantId: demoTenantId,
          branchId: demoBranchId,
          ...productData,
        },
      });

      const imageCount = await prisma.productImage.count({
        where: { productId: savedProduct.id },
      });

      if (imageCount === 0) {
        await prisma.productImage.createMany({
          data: images.map((fileName) => ({
            productId: savedProduct.id,
            fileName,
          })),
        });
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
