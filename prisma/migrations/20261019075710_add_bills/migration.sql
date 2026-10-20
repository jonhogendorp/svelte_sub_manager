-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "estimateMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "renewalDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paidOn" DATETIME NOT NULL,
    CONSTRAINT "BillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BillPayment_billId_idx" ON "BillPayment"("billId");
