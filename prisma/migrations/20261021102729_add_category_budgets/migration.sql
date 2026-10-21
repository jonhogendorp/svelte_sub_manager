-- CreateTable
CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "budgetMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_category_key" ON "CategoryBudget"("category");
