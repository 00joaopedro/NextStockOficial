import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://prisma:prisma@127.0.0.1:65535/prisma?schema=public";
const migrationUrl = process.env.DIRECT_URL ?? databaseUrl;

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL ??= migrationUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  // Prisma CLI/migrations prefer DIRECT_URL; runtime continues using DATABASE_URL.
  datasource: {
    url: migrationUrl,
  },
});
