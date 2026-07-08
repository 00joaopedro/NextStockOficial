import 'dotenv/config';
import { validateMigrationTarget } from './validate-target-lib';

const result = validateMigrationTarget(process.env);

console.log(
  `Migration target validated for APP_ENV=${result.appEnv} (${result.targetDescription}).`,
);
