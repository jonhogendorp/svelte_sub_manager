-- CreateTable
CREATE TABLE "ExchangeRate" (
    "currency" TEXT NOT NULL PRIMARY KEY,
    "perEur" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "displayCurrency" TEXT NOT NULL DEFAULT 'EUR'
);

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
    "reminderAckedOccurrence" DATETIME,
    "reminderSnoozedUntil" DATETIME
);
-- Hand-edited: the generated INSERT omitted the new NOT NULL "priceMinor". Every existing
-- row is euro with 2 decimals, so the old float price converts exactly to integer cents.
INSERT INTO "new_Subscription" ("billingCycle", "category", "id", "name", "priceMinor", "reminderAckedOccurrence", "reminderSnoozedUntil", "renewalDate") SELECT "billingCycle", "category", "id", "name", CAST(ROUND("price" * 100) AS INTEGER), "reminderAckedOccurrence", "reminderSnoozedUntil", "renewalDate" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

