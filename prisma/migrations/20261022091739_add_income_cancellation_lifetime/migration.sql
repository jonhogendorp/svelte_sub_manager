-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "incomeCurrency" TEXT;
ALTER TABLE "Settings" ADD COLUMN "incomeMinor" INTEGER;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "cancelNoticeDays" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "cancelUrl" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "startedOn" DATETIME;
