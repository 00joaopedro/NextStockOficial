/*
  Warnings:

  - You are about to drop the column `created_at` on the `agenda_pets` table. All the data in the column will be lost.
  - You are about to drop the column `tenant_id` on the `agenda_pets` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `agenda_pets` table. All the data in the column will be lost.
  - Added the required column `tenantId` to the `agenda_pets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `agenda_pets` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "idx_agendapet_tenant";

-- AlterTable
ALTER TABLE "agenda_pets" DROP COLUMN "created_at",
DROP COLUMN "tenant_id",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tenantId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "data" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "agenda_pets_tenantId_idx" ON "agenda_pets"("tenantId");
