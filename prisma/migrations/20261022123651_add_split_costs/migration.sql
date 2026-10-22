-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "sharedWith" TEXT
);
INSERT INTO "new_Subscription" ("accountEmail", "billingCycle", "cancelNoticeDays", "cancelUrl", "cancelledAt", "category", "currency", "id", "intervalCount", "name", "notes", "paymentMethod", "priceMinor", "reminderAckedOccurrence", "reminderSnoozedUntil", "renewalDate", "startedOn", "status", "trialAckedAt", "trialEndsAt", "trialSnoozedUntil", "usageRating", "yearlyPriceMinor") SELECT "accountEmail", "billingCycle", "cancelNoticeDays", "cancelUrl", "cancelledAt", "category", "currency", "id", "intervalCount", "name", "notes", "paymentMethod", "priceMinor", "reminderAckedOccurrence", "reminderSnoozedUntil", "renewalDate", "startedOn", "status", "trialAckedAt", "trialEndsAt", "trialSnoozedUntil", "usageRating", "yearlyPriceMinor" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
