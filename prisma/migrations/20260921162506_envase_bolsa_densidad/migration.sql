-- DropIndex
DROP INDEX "trabajos_impresion_token_key";

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "densidad" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "trabajos_impresion" ADD COLUMN     "tipoEnvase" TEXT;

-- CreateIndex
CREATE INDEX "trabajos_impresion_token_idx" ON "trabajos_impresion"("token");
