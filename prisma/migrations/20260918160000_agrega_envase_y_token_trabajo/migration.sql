-- AlterTable
ALTER TABLE "trabajos_impresion" ADD COLUMN     "envaseNumero" INTEGER,
ADD COLUMN     "envaseTotal" INTEGER,
ADD COLUMN     "token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "trabajos_impresion_token_key" ON "trabajos_impresion"("token");
