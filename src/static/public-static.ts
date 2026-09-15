import fastifyStatic, { type FastifyStaticOptions } from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { existsSync } from 'fs';
import { join } from 'path';

const publicPath = join(__dirname, '..', '..', 'public');

export async function registerPublicStatic(app: FastifyInstance) {
  await app.register(fastifyStatic, {
    root: existsSync(publicPath) ? publicPath : join(__dirname, '..', 'public'),
    etag: true,
    index: ['index.html'],
    wildcard: true,
    allowedPath(pathname) {
      return (
        pathname !== '/api' &&
        !pathname.startsWith('/api/') &&
        pathname !== '/dev.html' &&
        pathname !== '/parceiros.html'
      );
    },
    globIgnore: ['dev.html', 'parceiros.html'],
    setHeaders(res, filePath) {
      const reply = res as unknown as {
        setHeader(name: string, value: string): void;
      };
      const setHeader = (name: string, value: string) =>
        reply.setHeader(name, value);
      if (/\.html$/i.test(filePath)) {
        setHeader(
          'Cache-Control',
          /[/\\]reset-password\.html$/i.test(filePath)
            ? 'no-store'
            : 'no-cache',
        );
        if (/[/\\]reset-password\.html$/i.test(filePath))
          setHeader('Referrer-Policy', 'no-referrer');
        return;
      }
      if (
        /\.[a-f0-9]{8,}\.(?:js|css|webp|png|jpg|jpeg|svg|woff2?)$/i.test(
          filePath,
        )
      ) {
        setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      if (/[/\\]sidebar\.js$/i.test(filePath)) {
        setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        return;
      }
      setHeader('Cache-Control', 'public, max-age=3600');
    },
  } satisfies FastifyStaticOptions);
}
