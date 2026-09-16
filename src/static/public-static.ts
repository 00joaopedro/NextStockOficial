import fastifyStatic, { type FastifyStaticOptions } from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

const publicPath = resolve(process.cwd(), 'public');

export async function registerPublicStatic(app: FastifyInstance) {
  if (!existsSync(publicPath) || !statSync(publicPath).isDirectory())
    throw new Error('Public asset directory is unavailable.');
  await app.register(fastifyStatic, {
    root: publicPath,
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
    setHeaders(reply: FastifyReply, filePath) {
      const setHeader = (
        name: Parameters<FastifyReply['header']>[0],
        value: string,
      ) => reply.header(name, value);
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
