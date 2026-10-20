-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('MESSAGE', 'PROPOSAL', 'PROJECT', 'ORDER_NOTE', 'REVIEW');

-- CreateEnum
CREATE TYPE "ContentFlagStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ContentFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ContentSource" NOT NULL,
    "entityId" TEXT NOT NULL,
    "orderId" TEXT,
    "kinds" TEXT[],
    "matches" JSONB NOT NULL,
    "original" TEXT NOT NULL,
    "masked" BOOLEAN NOT NULL,
    "status" "ContentFlagStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentFlag_status_createdAt_idx" ON "ContentFlag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentFlag_userId_createdAt_idx" ON "ContentFlag"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentFlag_source_entityId_idx" ON "ContentFlag"("source", "entityId");

-- AddForeignKey
ALTER TABLE "ContentFlag" ADD CONSTRAINT "ContentFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
