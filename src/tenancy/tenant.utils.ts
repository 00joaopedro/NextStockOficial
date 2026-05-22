export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  systemType: string;
};

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildTenantNameFromEmail(email: string): string {
  return email.split('@')[0] || 'tenant';
}

export async function generateUniqueTenantSlug(
  rawValue: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(rawValue) || 'tenant';
  let candidate = base;
  let suffix = 1;

  while (await isTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function toTenantSummary(
  tenant?: Partial<TenantSummary> | null,
): TenantSummary | null {
  if (!tenant) {
    return null;
  }

  return {
    id: tenant.id ?? '',
    name: tenant.name ?? '',
    slug: tenant.slug ?? '',
    systemType: tenant.systemType ?? 'padrao',
  };
}
