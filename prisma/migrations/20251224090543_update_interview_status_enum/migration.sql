/*
  Warnings:

  - The values [FAILED,PASSED] on the enum `InterviewStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InterviewStatus_new" AS ENUM ('NOT_STARTED', 'PENDING_REVIEW', 'REJECTED', 'APPROVED');
ALTER TABLE "public"."Interview" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."User" ALTER COLUMN "interviewStatus" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "interviewStatus" TYPE "InterviewStatus_new" USING ("interviewStatus"::text::"InterviewStatus_new");
ALTER TABLE "Interview" ALTER COLUMN "status" TYPE "InterviewStatus_new" USING ("status"::text::"InterviewStatus_new");
ALTER TYPE "InterviewStatus" RENAME TO "InterviewStatus_old";
ALTER TYPE "InterviewStatus_new" RENAME TO "InterviewStatus";
DROP TYPE "public"."InterviewStatus_old";
ALTER TABLE "Interview" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';
ALTER TABLE "User" ALTER COLUMN "interviewStatus" SET DEFAULT 'NOT_STARTED';
COMMIT;
