import { Injectable } from '@nestjs/common';

type RailwayDeployment = {
  id?: string;
  status?: string;
  createdAt?: string;
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
