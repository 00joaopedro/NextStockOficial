import { Injectable } from '@nestjs/common';

type RailwayDeployment = {
  id?: string;
  status?: string;
  createdAt?: string;
};

type RailwayUsageRow = {
  measurement?: string;
  value?: number;
  tags?: { projectId?: string; serviceId?: string };
};

export type RailwayServiceUsage = {
  available: boolean;
  costUsd: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  updatedAt: string;
  serviceIds: string[];
};

const USAGE_MEASUREMENTS = [
  'MEMORY_USAGE_GB',
  'CPU_USAGE',
  'NETWORK_TX_GB',
  'DISK_USAGE_GB',
  'BACKUP_USAGE_GB',
];

// Railway publishes these standard container rates. Keep the calculation here
// instead of exposing provider usage payloads to tenant-facing endpoints.
const COST_PER_MEASUREMENT: Record<string, number> = {
  MEMORY_USAGE_GB: 10 / 43_200,
  CPU_USAGE: 20 / 43_200,
  NETWORK_TX_GB: 0.05,
  DISK_USAGE_GB: 0.15 / 43_200,
  BACKUP_USAGE_GB: 0.15 / 43_200,
};

@Injectable()
export class RailwayMetricsService {
  private readonly apiUrl = 'https://backboard.railway.com/graphql/v2';

  isConfigured(): boolean {
    return Boolean(
      process.env.RAILWAY_API_TOKEN &&
        process.env.RAILWAY_PROJECT_ID &&
        process.env.RAILWAY_ENVIRONMENT_ID &&
        process.env.RAILWAY_SERVICE_ID,
    );
  }

  isUsageConfigured(): boolean {
    return Boolean(
      this.isConfigured() &&
        process.env.RAILWAY_WORKSPACE_ID &&
        this.usageServiceIds().length,
    );
  }

  async getServiceUsage(): Promise<RailwayServiceUsage> {
    const unavailable = (): RailwayServiceUsage => ({
      available: false,
      costUsd: null,
      periodStart: null,
      periodEnd: null,
      updatedAt: new Date().toISOString(),
      serviceIds: this.usageServiceIds(),
    });

    if (!this.isUsageConfigured()) return unavailable();

    try {
      const workspaceId = process.env.RAILWAY_WORKSPACE_ID!;
      const context = await this.graphql(
        `query UsageContext($workspaceId: String!) {
          workspace(workspaceId: $workspaceId) {
            customer { billingPeriod { start end } }
          }
        }`,
        { workspaceId },
      );
      const period = context?.workspace?.customer?.billingPeriod;
      if (!period?.start || !period?.end) return unavailable();

      const payload = await this.graphql(
        `query ServiceUsage($workspaceId: String!, $measurements: [MetricMeasurement!]!, $startDate: DateTime!, $endDate: DateTime!) {
          usage(workspaceId: $workspaceId, measurements: $measurements, groupBy: [PROJECT_ID, SERVICE_ID], startDate: $startDate, endDate: $endDate, includeDeleted: true) {
            measurement value tags { projectId serviceId }
          }
        }`,
        {
          workspaceId,
          measurements: USAGE_MEASUREMENTS,
          startDate: period.start,
          endDate: period.end,
        },
      );
      const serviceIds = this.usageServiceIds();
      const costUsd = (Array.isArray(payload?.usage) ? payload.usage : [])
        .filter((row: RailwayUsageRow) =>
          row?.tags?.projectId === process.env.RAILWAY_PROJECT_ID &&
          serviceIds.includes(String(row?.tags?.serviceId || '')),
        )
        .reduce((total: number, row: RailwayUsageRow) => {
          const value = Number(row?.value);
          const rate = COST_PER_MEASUREMENT[String(row?.measurement || '')];
          return Number.isFinite(value) && Number.isFinite(rate)
            ? total + value * rate
            : total;
        }, 0);

      return {
        available: Number.isFinite(costUsd),
        costUsd: Number.isFinite(costUsd) ? costUsd : null,
        periodStart: period.start,
        periodEnd: period.end,
        updatedAt: new Date().toISOString(),
        serviceIds,
      };
    } catch {
      return unavailable();
    }
  }

  async getOverview() {
    const projectId = process.env.RAILWAY_PROJECT_ID || '';
    const serviceId = process.env.RAILWAY_SERVICE_ID || '';

    if (!this.isConfigured()) {
      return {
        status: 'unavailable',
        projectId,
        serviceId,
        cpu: null,
        memory: null,
        network: null,
        deployments: [],
        message: 'Railway nao configurado no backend.',
      };
    }

    try {
      const data = await this.graphql(
        `
          query DevRailwayDeployments($input: DeploymentListInput!) {
            deployments(input: $input, first: 5) {
              edges {
                node {
                  id
                  status
                  createdAt
                }
              }
            }
          }
        `,
        {
          input: {
            projectId,
            environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
            serviceId,
          },
        },
      );

      const deployments = this.normalizeDeployments(data);

      return {
        status: 'ok',
        projectId,
        serviceId,
        cpu: null,
        memory: null,
        network: null,
        deployments,
        message:
          'Metricas de CPU/RAM/rede retornam null quando indisponiveis pela API/permissoes atuais.',
      };
    } catch {
      return {
        status: 'unavailable',
        projectId,
        serviceId,
        cpu: null,
        memory: null,
        network: null,
        deployments: [],
        message:
          'Metrica nao disponivel com as permissoes/configuracao atual.',
      };
    }
  }

  private async graphql(query: string, variables?: Record<string, unknown>) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RAILWAY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.errors) {
      throw new Error('Railway GraphQL request failed.');
    }

    return payload.data;
  }

  private usageServiceIds(): string[] {
    const configured = process.env.RAILWAY_USAGE_SERVICE_IDS || process.env.RAILWAY_SERVICE_ID || '';
    return [...new Set(configured.split(',').map((value) => value.trim()).filter(Boolean))];
  }

  private normalizeDeployments(data: any): RailwayDeployment[] {
    const edges = data?.deployments?.edges;

    if (!Array.isArray(edges)) {
      return [];
    }

    return edges.map((edge) => ({
      id: edge?.node?.id,
      status: edge?.node?.status,
      createdAt: edge?.node?.createdAt,
    }));
  }
}
