-- DropForeignKey
ALTER TABLE "cotizaciones" DROP CONSTRAINT "cotizaciones_enviadoPorId_fkey";

-- DropIndex
DROP INDEX "cotizaciones_estado_idx";

-- AlterTable
ALTER TABLE "cotizaciones" DROP COLUMN "enviadoEn",
DROP COLUMN "enviadoPorId",
DROP COLUMN "estado",
ADD COLUMN     "avisoAlmacenEn" TIMESTAMP(3),
ADD COLUMN     "cotizacionEnviadaEn" TIMESTAMP(3),
ADD COLUMN     "pedidoAprobadoEn" TIMESTAMP(3),
ADD COLUMN     "requerimientoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ultimoEditadoPorId" INTEGER;

-- DropEnum
DROP TYPE "EstadoCotizacion";

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_ultimoEditadoPorId_fkey" FOREIGN KEY ("ultimoEditadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
