import { of } from 'rxjs';
import { UsageInterceptor } from './usage.interceptor';

describe('UsageInterceptor', () => {
  it('registra apenas contexto validado e não guarda parâmetros sensíveis da URL', () => {
    const usage = { record: jest.fn().mockResolvedValue(null) };
    const req: any = { user: { id: 'u' }, tenantContext: { tenantId: 't', branchId: 'b', systemType: 'padrao' }, route: { path: '/products/:id' }, originalUrl: '/api/products/1?token=secret', method: 'GET', res: { statusCode: 200 } };
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as any;
    new UsageInterceptor(usage as any).intercept(context, { handle: () => of('ok') }).subscribe();
    expect(usage.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't', branchId: 'b', route: '/products/:id', eventType: 'request' }));
    expect(JSON.stringify(usage.record.mock.calls)).not.toContain('secret');
  });

  it('ignora solicitação sem contexto validado e não duplica evento de page-view', () => {
    const usage = { record: jest.fn().mockResolvedValue(null) };
    const req: any = { user: { id: 'u' }, route: { path: '/products' }, originalUrl: '/api/products' };
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as any;
    const interceptor = new UsageInterceptor(usage as any);
    interceptor.intercept(context, { handle: () => of('ok') }).subscribe();
    req.tenantContext = { tenantId: 't' };
    req.originalUrl = '/api/usage/page-view';
    interceptor.intercept(context, { handle: () => of('ok') }).subscribe();
    expect(usage.record).not.toHaveBeenCalled();
  });
});
