import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import {
  selectAdministrativeDatabaseUrl,
  selectRuntimeDatabaseUrl,
} from './scripts/lib/admin-database-url';

const isMigrateCommand = process.argv.includes('migrate');
const databaseUrl = selectRuntimeDatabaseUrl(process.env);
const migrationUrl = isMigrateCommand
  ? selectAdministrativeDatabaseUrl(process.env)
  : process.env.ADMIN_DATABASE_URL || process.env.DIRECT_URL || databaseUrl;

process.env.DATABASE_URL = databaseUrl;
// `directUrl` is required while Prisma parses schema.prisma, including for
// offline commands such as `validate`. Protected migrate commands have already
// been rejected above when neither administrative URL is configured.
process.env.DIRECT_URL ??= migrationUrl;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  // Runtime continues using DATABASE_URL through PrismaService.
  // `prisma migrate ...` must use ADMIN_DATABASE_URL/DIRECT_URL and never the
  // Supabase transaction pooler on :6543.
  datasource: {
    url: migrationUrl,
  },
});
