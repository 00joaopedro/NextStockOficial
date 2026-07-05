import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  async buildTenantExportManifest(tenantId: string) {
    const [
      tenant,
      branches,
      members,
      employees,
      petClients,
      pets,
      orders,
      sales,
      expenses,
      files,
    ] = await this.prisma.$transaction([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          cnpj: true,
          contactEmail: true,
          contactPhone: true,
          systemType: true,
          createdAt: true,
        },
      }),
      this.prisma.branch.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true, createdAt: true },
      }),
      this.prisma.tenantMember.findMany({
        where: { tenantId },
        select: {
          role: true,
          createdAt: true,
          userProfile: {
            select: { id: true, name: true, email: true, createdAt: true },
          },
        },
      }),
      this.prisma.employee.findMany({
        where: { tenantId },
        select: {
          id: true,
          fullName: true,
          email: true,
          jobTitle: true,
          employeeRole: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.petClient.findMany({
        where: { tenantId, deletedAt: null },
      }),
      this.prisma.pet.findMany({ where: { tenantId, deletedAt: null } }),
      this.prisma.order.findMany({ where: { tenantId, deletedAt: null } }),
      this.prisma.sale.findMany({ where: { tenantId, deletedAt: null } }),
      this.prisma.expense.findMany({ where: { tenantId, deletedAt: null } }),
      this.prisma.storedFile.findMany({
        where: { tenantId },
        select: {
          id: true,
          module: true,
          targetType: true,
          targetId: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          uploadedAt: true,
        },
      }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      tenant,
      branches,
      members,
      employees,
      petClients,
      pets,
      orders,
      sales,
      expenses,
      files: files.map((file) => ({
        ...file,
        sizeBytes: file.sizeBytes.toString(),
      })),
      excluded: [
        'passwords',
        'tokens',
        'cookies',
        'service_role',
        'certificate_password',
        'certificate_content',
        'signed_urls',
      ],
    };
  }

  async retentionReport() {
    const now = Date.now();
    const daysAgo = (days: number) => new Date(now - days * 86_400_000);
    const [oldUsage, oldSessions, oldAudits, orphanedFiles] =
      await this.prisma.$transaction([
        this.prisma.userUsageEvent.count({
          where: { createdAt: { lt: daysAgo(90) } },
        }),
        this.prisma.userSession.count({
          where: {
            OR: [
              { expiresAt: { lt: daysAgo(120) } },
              { revokedAt: { lt: daysAgo(120) } },
            ],
          },
        }),
        this.prisma.securityAuditEvent.count({
          where: { createdAt: { lt: daysAgo(730) } },
        }),
        this.prisma.storedFile.count({
          where: { status: { in: ['ORPHANED', 'QUARANTINED'] } },
        }),
      ]);
    return { oldUsage, oldSessions, oldAudits, orphanedFiles };
  }

  anonymizationPlan(profileId: string) {
    return {
      profileId,
      dryRun: true,
      mutable: ['profiles.name', 'profiles.full_name', 'profiles.email'],
      preserve: [
        'sales',
        'billing_payments',
        'sale_documents',
        'fiscal_document_events',
        'security_audit_events',
      ],
      warning:
        'Execution requires legal review, tenant scoping and a dedicated approved migration/job.',
    };
  }
}
