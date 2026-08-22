export type NextStockProcessRole = 'api' | 'audit-worker' | 'all';

export function processRole(env: NodeJS.ProcessEnv = process.env): NextStockProcessRole {
  const value = env.NEXTSTOCK_PROCESS_ROLE?.trim() || 'all';
  if (value !== 'api' && value !== 'audit-worker' && value !== 'all') {
    throw new Error('Invalid NEXTSTOCK_PROCESS_ROLE; expected api, audit-worker, or all');
  }
  return value;
}

export const startsApi = (role: NextStockProcessRole) => role === 'api' || role === 'all';
export const startsAuditWorker = (role: NextStockProcessRole) => role === 'audit-worker' || role === 'all';
