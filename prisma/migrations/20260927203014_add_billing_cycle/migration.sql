-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "category" TEXT NOT NULL,
    "renewalDate" DATETIME NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly'
);
INSERT INTO "new_Subscription" ("category", "id", "name", "price", "renewalDate") SELECT "category", "id", "name", "price", "renewalDate" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
