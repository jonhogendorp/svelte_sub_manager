-- CreateTable
CREATE TABLE "SentReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "displayCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "budgetMinor" INTEGER,
    "budgetCurrency" TEXT,
    "incomeMinor" INTEGER,
    "incomeCurrency" TEXT,
    "reminderEmail" TEXT,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 3
);
INSERT INTO "new_Settings" ("budgetCurrency", "budgetMinor", "displayCurrency", "id", "incomeCurrency", "incomeMinor") SELECT "budgetCurrency", "budgetMinor", "displayCurrency", "id", "incomeCurrency", "incomeMinor" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SentReminder_key_key" ON "SentReminder"("key");
