-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "hiddenByRole" "Role";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockedByRole" "Role";

-- CreateIndex
CREATE INDEX "Message_orderId_createdAt_idx" ON "Message"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_employerId_updatedAt_idx" ON "Order"("employerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Order_freelancerId_updatedAt_idx" ON "Order"("freelancerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Project_employerId_createdAt_idx" ON "Project"("employerId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_freelancerId_createdAt_idx" ON "Proposal"("freelancerId", "createdAt");

-- Backfill: role of whoever blocked/hid before this column existed.
UPDATE "User" u SET "blockedByRole" = b."role" FROM "User" b WHERE u."blockedById" = b."id" AND u."blockedByRole" IS NULL;
UPDATE "Project" p SET "hiddenByRole" = b."role" FROM "User" b WHERE p."hiddenById" = b."id" AND p."hiddenByRole" IS NULL;

-- Public search uses ILIKE '%q%' on title/description: trigram indexes keep it
-- from scanning the whole table.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Project_title_trgm_idx" ON "Project" USING gin ("title" gin_trgm_ops);
CREATE INDEX "Project_description_trgm_idx" ON "Project" USING gin ("description" gin_trgm_ops);
