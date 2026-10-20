// Simulate Nest's fatal initialization behavior in a separate CLI process.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@nestjs/core') {
    return {
      NestFactory: {
        createApplicationContext: async (_module, options) => {
          if (options.abortOnError !== false) process.exit(1);
          throw new Error('secret database URL and token');
        },
      },
    };
  }
  if (request === '../../src/app.module') return { AppModule: class {} };
  if (request === '../../src/prisma/prisma.service') return { PrismaService: class {} };
  if (request === '../../src/billing/gateways/payment-gateway.registry') return { PaymentGatewayRegistry: class {} };
  if (request === '../../src/billing/payments.service') return { PaymentsService: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
