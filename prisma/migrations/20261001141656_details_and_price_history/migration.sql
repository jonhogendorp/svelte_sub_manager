-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "accountEmail" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "notes" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "paymentMethod" TEXT;

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "oldMinor" INTEGER NOT NULL,
    "newMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PriceChange_subscriptionId_idx" ON "PriceChange"("subscriptionId");
