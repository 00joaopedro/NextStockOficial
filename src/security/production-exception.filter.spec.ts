import { ArgumentsHost, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductionExceptionFilter } from './production-exception.filter';

describe('ProductionExceptionFilter', () => {
  const createHost = (error?: unknown) => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = {
      requestId: 'request-1',
      method: 'POST',
      path: '/api/auth/register',
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as ArgumentsHost;

    return { host, response, request, error };
  };

  it('loga codigo e meta Prisma sanitizados sem vazar segredo', () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Column `profiles.allowed_system_types` does not exist. password=secret DATABASE_URL=postgres://user:pass@host/db',
      {
        code: 'P2022',
        clientVersion: '6.19.3',
        meta: {
          modelName: 'Profile',
          column: 'profiles.allowed_system_types',
          password: 'secret',
          token: 'jwt-token',
        },
      },
    );
    const { host, response } = createHost();

    new ProductionExceptionFilter().catch(prismaError, host);

    const logLine = String(loggerSpy.mock.calls[0]?.[0]);
    expect(logLine).toContain('id=request-1');
    expect(logLine).toContain('method=POST');
    expect(logLine).toContain('path=/api/auth/register');
    expect(logLine).toContain('error=PrismaClientKnownRequestError');
    expect(logLine).toContain('code=P2022');
    expect(logLine).toContain('"column":"profiles.allowed_system_types"');
    expect(logLine).toContain('"password":"[REDACTED]"');
    expect(logLine).toContain('"token":"[REDACTED]"');
    expect(logLine).not.toContain('postgres://user:pass');
    expect(logLine).not.toContain('jwt-token');
    expect(response.status).toHaveBeenCalledWith(500);

    loggerSpy.mockRestore();
  });

  it('responde com reply.status().send() em adapters Fastify', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          requestId: 'request-1',
          method: 'GET',
          path: '/',
        }),
      }),
    } as ArgumentsHost;

    new ProductionExceptionFilter().catch(new Error('boom'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, requestId: 'request-1' }),
    );
  });
});
