import { readFileSync } from 'fs';
import { join } from 'path';

describe('order edit browser concurrency contract', () => {
  const source = readFileSync(
    join(process.cwd(), 'public', 'Js', 'pedido.js'),
    'utf8',
  );

  it('sends the loaded version and adopts the returned order', () => {
    expect(source).toContain('expectedVersion: order.version');
    expect(source).toContain('loadedDetailOrder = result.order');
  });

  it('handles 409 by requiring a reload and never blindly retrying', () => {
    expect(source).toContain('if (error.status === 409)');
    expect(source).toContain('loadedDetailOrder = null');
    expect(source.match(/apiFetch\(`\/orders\/\$\{order\.id\}`/g)).toHaveLength(1);
  });
});
