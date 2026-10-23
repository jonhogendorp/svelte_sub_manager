-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "estimateMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "renewalDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "businessPercent" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Bill" ("billingCycle", "currency", "estimateMinor", "id", "intervalCount", "kind", "name", "notes", "renewalDate", "status") SELECT "billingCycle", "currency", "estimateMinor", "id", "intervalCount", "kind", "name", "notes", "renewalDate", "status" FROM "Bill";
DROP TABLE "Bill";
ALTER TABLE "new_Bill" RENAME TO "Bill";
CREATE TABLE "new_Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "category" TEXT NOT NULL,
    "renewalDate" DATETIME NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "trialEndsAt" DATETIME,
    "reminderAckedOccurrence" DATETIME,
    "reminderSnoozedUntil" DATETIME,
    "trialAckedAt" DATETIME,
    "trialSnoozedUntil" DATETIME,
    "accountEmail" TEXT,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "usageRating" INTEGER,
    "cancelledAt" DATETIME,
    "yearlyPriceMinor" INTEGER,
    "cancelUrl" TEXT,
    "cancelNoticeDays" INTEGER,
    "startedOn" DATETIME,
    "shareCount" INTEGER NOT NULL DEFAULT 1,
    "sharedWith" TEXT,
    "businessPercent" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Subscription" ("accountEmail", "billingCycle", "cancelNoticeDays", "cancelUrl", "cancelledAt", "category", "currency", "id", "intervalCount", "name", "notes", "paymentMethod", "priceMinor", "reminderAckedOccurrence", "reminderSnoozedUntil", "renewalDate", "shareCount", "sharedWith", "startedOn", "status", "trialAckedAt", "trialEndsAt", "trialSnoozedUntil", "usageRating", "yearlyPriceMinor") SELECT "accountEmail", "billingCycle", "cancelNoticeDays", "cancelUrl", "cancelledAt", "category", "currency", "id", "intervalCount", "name", "notes", "paymentMethod", "priceMinor", "reminderAckedOccurrence", "reminderSnoozedUntil", "renewalDate", "shareCount", "sharedWith", "startedOn", "status", "trialAckedAt", "trialEndsAt", "trialSnoozedUntil", "usageRating", "yearlyPriceMinor" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
