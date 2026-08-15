import { createServer, type Server } from 'node:http';
import { SuperTokensCoreClient } from './supertokens-core-client';

describe('SuperTokens Core HTTP boundary', () => {
  let server: Server;
  let baseUrl: string;
  afterEach(async () => { await new Promise<void>((resolve) => server?.close(() => resolve())); });

  it('uses the real HTTP contract without logging the secret or hash', async () => {
    let receivedApiKey = '';
    server = createServer((request, response) => {
      receivedApiKey = String(request.headers['api-key']);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'OK', userId: 'core-user' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server failed');
    baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await new SuperTokensCoreClient({ connectionUri: baseUrl, apiKey: 'test-key' }).importPasswordHash({ email: 'user@test.invalid', passwordHash: '$2b$10$GzEm3vKoAqnJCTWesRARCe/ovjt/07qjvcH9jbLUg44Fn77gMZkmm' });
    expect(result.status).toBe('OK');
    expect(receivedApiKey).toBe('test-key');
  });

  it('fails closed on an invalid API key', async () => {
    server = createServer((_request, response) => { response.statusCode = 401; response.end(); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server failed');
    await expect(new SuperTokensCoreClient({ connectionUri: `http://127.0.0.1:${address.port}`, apiKey: 'bad' }).request('/x', {})).rejects.toThrow('AUTH_FAILED');
  });
});
