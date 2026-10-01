-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "reminderAckedOccurrence" DATETIME;
ALTER TABLE "Subscription" ADD COLUMN "reminderSnoozedUntil" DATETIME;
