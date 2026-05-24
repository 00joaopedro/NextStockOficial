import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupabaseMetricsService {
  private readonly apiUrl = 'https://api.supabase.com/v1';

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.SUPABASE_ACCESS_TOKEN && process.env.SUPABASE_PROJECT_REF,
    );
  }

  async isDatabaseConnected(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async getOverview() {
    const projectRef = process.env.SUPABASE_PROJECT_REF || '';
    const [databaseSize, activeConnections] = await Promise.all([
      this.getDatabaseSize(),
      this.getActiveConnections(),
    ]);

    if (!this.isConfigured()) {
      return {
        status: 'unavailable',
        projectRef,
        databaseSize,
        activeConnections,
        storageUsed: null,
        message:
          'Supabase Management API nao configurada no backend; metricas do Postgres usam Prisma quando possivel.',
      };
    }

    try {
      await this.request(`/projects/${projectRef}`);

      return {
        status: 'ok',
        projectRef,
        databaseSize,
        activeConnections,
        storageUsed: null,
        message:
          'Storage usado retorna null quando indisponivel pela Management API/permissoes atuais.',
      };
    } catch {
      return {
        status: 'unavailable',
        projectRef,
        databaseSize,
        activeConnections,
        storageUsed: null,
        message:
          'Metrica nao disponivel com as permissoes/configuracao atual.',
      };
    }
  }

  private async request(path: string) {
    const response = await fetch(`${this.apiUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Supabase Management API request failed.');
    }

    return response.json();
  }

  private async getDatabaseSize(): Promise<number | null> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ size: bigint | number }>>`
        SELECT pg_database_size(current_database()) AS size
      `;
      const value = rows[0]?.size;
      return value == null ? null : Number(value);
    } catch {
      return null;
    }
  }

  private async getActiveConnections(): Promise<number | null> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>`
        SELECT count(*) AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      const value = rows[0]?.count;
      return value == null ? null : Number(value);
    } catch {
      return null;
    }
  }
}
