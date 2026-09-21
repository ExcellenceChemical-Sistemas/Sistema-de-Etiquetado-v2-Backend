-- DropIndex
DROP INDEX "trabajos_impresion_token_idx";

-- AlterTable
ALTER TABLE "trabajos_impresion" DROP COLUMN "tipoEnvase";

-- CreateIndex
CREATE UNIQUE INDEX "trabajos_impresion_token_key" ON "trabajos_impresion"("token");
