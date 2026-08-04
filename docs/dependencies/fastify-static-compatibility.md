# Fastify static compatibility exception

`@fastify/static@10.1.2` is retained because the current HIGH advisories affect older releases. The installed Nest packages currently publish narrower peer ranges: `@nestjs/platform-fastify@11.1.28` accepts `^8 || ^9`, and `@nestjs/serve-static@5.0.5` accepts `^8.0.4 || ^9.0.0`.

The application uses `ServeStaticModule` in `src/app.module.ts` to serve `public/` through Fastify, so removing these packages would break the production frontend. Runtime bootstrap, static responses, traversal handling, and Sharp smoke tests are covered by the DEP-016 validation.

The CI validator names this narrowly scoped compatibility debt `TEMPORARY_FASTIFY_STATIC_SECURITY_COMPATIBILITY_EXCEPTION`. It accepts only the exact versions, peer ranges, resolved URLs, and integrity metadata recorded in `package-lock.json`; all other invalid, missing, peer-missing, and extraneous problems remain blocking.

Remove the exception when Nest officially accepts `@fastify/static@10.1.2` or newer. Review with:

```text
npm view @nestjs/platform-fastify peerDependencies dependencies
npm view @nestjs/serve-static peerDependencies dependencies
npm audit --omit=dev --audit-level=high
```
