export function assertMaintenanceEnvironment(operation: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const environment =
    process.env.APP_ENV || process.env.NODE_ENV || 'development';
  if (
    environment === 'production' &&
    process.env.ALLOW_PRODUCTION_MAINTENANCE !== operation
  ) {
    throw new Error(
      `Production requires ALLOW_PRODUCTION_MAINTENANCE=${operation}.`,
    );
  }
  return {
    environment,
    dryRun: process.env.MAINTENANCE_APPLY !== 'true',
  };
}
