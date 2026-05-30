import { Injectable } from '@nestjs/common';

type EstimateInput = {
  userWeight: number;
  totalWeight: number;
  railwayTotalUnits: number;
  supabaseTotalUnits: number;
  railwayCostCents?: number | null;
  supabaseCostCents?: number | null;
};

@Injectable()
export class DevUsageCalculatorService {
  estimateForUser(input: EstimateInput) {
    const share = input.totalWeight > 0 ? input.userWeight / input.totalWeight : 0;
    const railwayCostCents =
      input.railwayCostCents == null ? null : Math.round(input.railwayCostCents * share);
    const supabaseCostCents =
      input.supabaseCostCents == null ? null : Math.round(input.supabaseCostCents * share);

    return {
      share,
      sharePercent: Number((share * 100).toFixed(2)),
      railway: {
        units: Number((input.railwayTotalUnits * share).toFixed(2)),
        costCents: railwayCostCents,
      },
      supabase: {
        units: Number((input.supabaseTotalUnits * share).toFixed(2)),
        costCents: supabaseCostCents,
      },
      estimatedCostCents:
        railwayCostCents == null && supabaseCostCents == null
          ? null
          : (railwayCostCents ?? 0) + (supabaseCostCents ?? 0),
    };
  }

  getRailwayUnits(railway: any): number {
    return this.sumNumeric([railway?.cpu, railway?.memory, railway?.network]);
  }

  getSupabaseUnits(supabase: any): number {
    const databaseSizeMb =
      typeof supabase?.databaseSize === 'number' ? supabase.databaseSize / 1024 / 1024 : 0;
    const storageMb =
      typeof supabase?.storageUsed === 'number' ? supabase.storageUsed / 1024 / 1024 : 0;

    return this.sumNumeric([databaseSizeMb, storageMb, supabase?.activeConnections]);
  }

  getEstimatedPeriodCostCents(provider: 'railway' | 'supabase', start: Date, end: Date) {
    const envName =
      provider === 'railway'
        ? 'DEV_RAILWAY_MONTHLY_COST_CENTS'
        : 'DEV_SUPABASE_MONTHLY_COST_CENTS';
    const monthlyCost = Number(process.env[envName]);

    if (!Number.isFinite(monthlyCost) || monthlyCost <= 0) {
      return null;
    }

    const days = Math.max(0, end.getTime() - start.getTime()) / 86_400_000;

    return Math.round(monthlyCost * (days / 30));
  }

  private sumNumeric(values: unknown[]): number {
    return values.reduce<number>((total, value) => {
      const numeric = Number(value);

      return Number.isFinite(numeric) ? total + numeric : total;
    }, 0);
  }
}
