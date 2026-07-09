-- AlterTable
ALTER TABLE "ServeryMealServiceEvent" ADD COLUMN "operationInstanceId" TEXT;

-- CreateIndex
CREATE INDEX "ServeryMealServiceEvent_operationInstanceId_idx" ON "ServeryMealServiceEvent"("operationInstanceId");

-- AddForeignKey
ALTER TABLE "ServeryMealServiceEvent" ADD CONSTRAINT "ServeryMealServiceEvent_operationInstanceId_fkey" FOREIGN KEY ("operationInstanceId") REFERENCES "OperationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
